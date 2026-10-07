import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ForgotPasswordForm } from "@/components/forms/forgot-password-form";
import { forgotPassword } from "@/features/auth/forgot-password";

export const metadata = { title: "Forgot password" };

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-16">
      <div className="mb-8 flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-card bg-primary text-white">
          <GraduationCap className="size-6" aria-hidden="true" />
        </span>
        <span className="font-display text-xl font-bold">LERNOVIQ</span>
      </div>

      {error === "link_invalid" && (
        <div
          role="alert"
          className="mb-4 rounded-card border border-danger bg-danger-light p-3 text-sm text-danger-text"
        >
          That reset link is invalid or expired. Request a new one below.
        </div>
      )}

      <Card>
        <CardHeader
          title="Reset your password"
          description="Enter your email and we'll send you a reset link."
        />
        <CardContent>
          <ForgotPasswordForm onSubmit={forgotPassword} />
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-sm text-text-secondary">
        <Link href="/login" className="font-medium text-primary hover:underline">
          ← Back to login
        </Link>
      </p>
    </main>
  );
}
