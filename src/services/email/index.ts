import { AccountApi, Configuration, SendApi, type V1SendRequest } from "hostinger-mail-api-sdk";
import { Resend } from "resend";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

export type SendEmailResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Sends one email. Server-only. Never throws: a failed send must not abort a bulk announcement
 * loop, so each attempt is recorded (ok/error) for the caller to log per-recipient.
 *
 * Provider (ADR-044): Hostinger Mail when HOSTINGER_MAIL_API (API token) is set — sent from the
 * lernoviq.com mailbox, a copy lands in its Sent folder — otherwise Resend (RESEND_API_KEY).
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (process.env.HOSTINGER_MAIL_API)
    return sendWithHostinger(input, process.env.HOSTINGER_MAIL_API);

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    return {
      ok: false,
      error: "Email is not configured (HOSTINGER_MAIL_API, or RESEND_API_KEY/RESEND_FROM_EMAIL).",
    };
  }

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id ?? "" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown send error" };
  }
}

/* ---------- Hostinger Mail ---------- */

// The token is scoped to mailboxes; look the sender up once per server process.
let mailboxId: Promise<string> | null = null;

function senderMailbox(config: Configuration): Promise<string> {
  mailboxId ??= new AccountApi(config).getCurrentAccount().then(({ data }) => {
    const mailboxes = data.data?.mailboxes ?? [];
    const wanted = process.env.HOSTINGER_MAIL_FROM?.toLowerCase();
    const box = wanted ? mailboxes.find((m) => m.address.toLowerCase() === wanted) : mailboxes[0];
    if (!box)
      throw new Error(
        wanted ? `Mailbox ${wanted} is not available to this token` : "Token has no mailbox",
      );
    return box.resourceId;
  });
  mailboxId.catch(() => (mailboxId = null)); // retry the lookup next time instead of caching a failure
  return mailboxId;
}

async function sendWithHostinger(input: SendEmailInput, token: string): Promise<SendEmailResult> {
  try {
    const config = new Configuration({ accessToken: token });
    const resourceId = await senderMailbox(config);
    // The generated type marks every field required, but the API documents them as optional;
    // sending empty cc/attachments/inReplyTo would be wrong, so send only what we use.
    const request = {
      to: [input.to],
      subject: input.subject,
      html: input.html,
      displayName: process.env.HOSTINGER_MAIL_DISPLAY_NAME || "LERNOVIQ",
    } as V1SendRequest;
    await new SendApi(config).sendEmail(resourceId, request);
    return { ok: true, id: "" }; // the API answers 204 with no message ID
  } catch (err) {
    const res = (err as { response?: { status?: number; data?: { message?: string } } }).response;
    if (res?.status)
      return {
        ok: false,
        error: `Hostinger Mail ${res.status}: ${res.data?.message ?? "request failed"}`,
      };
    return { ok: false, error: err instanceof Error ? err.message : "Unknown send error" };
  }
}

/** Test hook: forget the cached sender mailbox. */
export function resetEmailProviderCache() {
  mailboxId = null;
}
