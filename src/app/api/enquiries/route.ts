import { NextResponse, type NextRequest } from "next/server";
import { submitEnquiry } from "@/features/enquiries/actions";
import type { EnquiryInput } from "@/features/enquiries/schema";
import { RATE_LIMITED_MESSAGE } from "@/services/rate-limit";

// T-264 (F-963, ADR-043, SECURITY §28): the static marketing site on lernoviq.com posts its contact
// form here. Same validation, rate limit, storage and email as the in-app form (submitEnquiry).
// Browsers may call it only from the marketing origins; anything else is still rate-limited.
const MAX_BODY_BYTES = 16_384;

function allowedOrigins(): string[] {
  return (process.env.MARKETING_SITE_ORIGINS ?? "https://lernoviq.com,https://www.lernoviq.com")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !allowedOrigins().includes(origin)) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);
  return new NextResponse(null, {
    status: "Access-Control-Allow-Origin" in headers ? 204 : 403,
    headers,
  });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);
  // A browser on another site: refuse outright (non-browser callers send no Origin).
  if (origin && !("Access-Control-Allow-Origin" in headers)) {
    return NextResponse.json({ ok: false, error: "Origin not allowed." }, { status: 403, headers });
  }
  if (!req.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ ok: false, error: "Send JSON." }, { status: 415, headers });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json(
      { ok: false, error: "Enquiry is too long." },
      { status: 413, headers },
    );
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400, headers });
  }

  const result = await submitEnquiry(body as EnquiryInput);
  const status = result.ok
    ? 200
    : result.fieldErrors
      ? 422
      : result.error === RATE_LIMITED_MESSAGE
        ? 429
        : 500;
  return NextResponse.json(result, { status, headers });
}
