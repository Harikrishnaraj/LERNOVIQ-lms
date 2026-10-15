import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { send, getCurrentAccount, hostingerSend } = vi.hoisted(() => ({
  send: vi.fn(),
  getCurrentAccount: vi.fn(),
  hostingerSend: vi.fn(),
}));
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(function Resend() {
    return { emails: { send } };
  }),
}));
vi.mock("hostinger-mail-api-sdk", () => ({
  Configuration: vi.fn().mockImplementation(function Configuration(p: unknown) {
    return p;
  }),
  AccountApi: vi.fn().mockImplementation(function AccountApi() {
    return { getCurrentAccount };
  }),
  SendApi: vi.fn().mockImplementation(function SendApi() {
    return { sendEmail: hostingerSend };
  }),
}));

import { resetEmailProviderCache, sendEmail } from "@/services/email";

const keys = [
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "HOSTINGER_MAIL_API",
  "HOSTINGER_MAIL_FROM",
] as const;
const original = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
const msg = { to: "a@example.com", subject: "Hi", html: "<p>hi</p>" };

afterEach(() => {
  for (const k of keys) {
    if (original[k] === undefined) delete process.env[k];
    else process.env[k] = original[k];
  }
});

describe("sendEmail via Resend (T-141)", () => {
  beforeEach(() => {
    send.mockReset();
    delete process.env.HOSTINGER_MAIL_API;
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM_EMAIL = "announcements@example.com";
  });

  it("returns ok:false without calling Resend when the provider is not configured", async () => {
    delete process.env.RESEND_API_KEY;
    const result = await sendEmail(msg);
    expect(result).toEqual({ ok: false, error: expect.stringContaining("not configured") });
    expect(send).not.toHaveBeenCalled();
  });

  it("returns ok:true with the message id on a successful send", async () => {
    send.mockResolvedValue({ data: { id: "msg_123" }, error: null });
    const result = await sendEmail(msg);
    expect(result).toEqual({ ok: true, id: "msg_123" });
    expect(send).toHaveBeenCalledWith({ from: "announcements@example.com", ...msg });
  });

  it("returns ok:false with the provider's error message when Resend rejects the send", async () => {
    send.mockResolvedValue({ data: null, error: { message: "invalid recipient" } });
    const result = await sendEmail({ ...msg, to: "bad" });
    expect(result).toEqual({ ok: false, error: "invalid recipient" });
  });

  it("never throws even if the SDK call itself throws", async () => {
    send.mockRejectedValue(new Error("network down"));
    const result = await sendEmail(msg);
    expect(result).toEqual({ ok: false, error: "network down" });
  });
});

// ADR-044: Hostinger Mail takes over when its API token is set.
describe("sendEmail via Hostinger Mail (ADR-044)", () => {
  beforeEach(() => {
    send.mockReset();
    getCurrentAccount.mockReset();
    hostingerSend.mockReset();
    resetEmailProviderCache();
    process.env.HOSTINGER_MAIL_API = "hm_test_token";
    getCurrentAccount.mockResolvedValue({
      data: {
        data: {
          mailboxes: [
            { resourceId: "mb_info", address: "info@lernoviq.com" },
            { resourceId: "mb_support", address: "support@lernoviq.com" },
          ],
        },
      },
    });
  });

  it("sends from the configured mailbox, looks it up once, and never touches Resend", async () => {
    process.env.HOSTINGER_MAIL_FROM = "Support@Lernoviq.com";
    hostingerSend.mockResolvedValue({ status: 204 });
    expect(await sendEmail(msg)).toEqual({ ok: true, id: "" });
    expect(await sendEmail(msg)).toEqual({ ok: true, id: "" });
    expect(getCurrentAccount).toHaveBeenCalledTimes(1);
    expect(hostingerSend).toHaveBeenCalledWith("mb_support", {
      to: ["a@example.com"],
      subject: "Hi",
      html: "<p>hi</p>",
      displayName: "LERNOVIQ",
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("uses the token's first mailbox when no sender is configured", async () => {
    delete process.env.HOSTINGER_MAIL_FROM;
    hostingerSend.mockResolvedValue({ status: 204 });
    await sendEmail(msg);
    expect(hostingerSend.mock.calls[0][0]).toBe("mb_info");
  });

  it("reports API errors without throwing, and retries the mailbox lookup after a failure", async () => {
    process.env.HOSTINGER_MAIL_FROM = "nobody@lernoviq.com";
    expect(await sendEmail(msg)).toEqual({
      ok: false,
      error: "Mailbox nobody@lernoviq.com is not available to this token",
    });

    process.env.HOSTINGER_MAIL_FROM = "support@lernoviq.com";
    hostingerSend.mockRejectedValue({ response: { status: 403, data: { message: "Forbidden" } } });
    expect(await sendEmail(msg)).toEqual({ ok: false, error: "Hostinger Mail 403: Forbidden" });
    expect(getCurrentAccount).toHaveBeenCalledTimes(2);
  });
});
