import Link from "next/link";
import { GraduationCap, MailCheck } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ResendVerificationButton } from "@/components/forms/resend-verification-button";
import { resendVerification } from "@/features/auth/resend-verification";

export const metadata = { title: "Verify your email" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; error?: string }>;
}) {
  const { email, error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-16">
      <div className="mb-8 flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-card bg-primary text-white">
          <GraduationCap className="size-6" aria-hidden="true" />
        </span>
        <span className="font-display text-xl font-bold">Modern LMS</span>
      </div>

      {error === "link_invalid" && (
        <div
          role="alert"
          className="mb-4 rounded-card border border-danger bg-danger-light p-3 text-sm text-danger-text"
        >
          That verification link is invalid or expired.{" "}
          {email ? "Request a new one below." : "Sign up again to get a new one."}
        </div>
      )}

      <Card>
        <CardHeader
          title="Check your inbox"
          description={
            email
              ? `We sent a verification link to ${email}. Click it to activate your account.`
              : "We sent you a verification link. Click it to activate your account."
          }
        />
        <CardContent className="flex flex-col items-center gap-4">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary-light text-primary">
            <MailCheck className="size-6" aria-hidden="true" />
          </span>
          {email && <ResendVerificationButton email={email} onResend={resendVerification} />}
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-sm text-text-secondary">
        <Link href="/" className="font-medium text-primary hover:underline">
          ← Back home
        </Link>
      </p>
    </main>
  );
}
