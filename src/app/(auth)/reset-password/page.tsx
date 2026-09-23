import { GraduationCap } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ResetPasswordForm } from "@/components/forms/reset-password-form";
import { resetPassword } from "@/features/auth/reset-password";

export const metadata = { title: "Reset password" };

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-16">
      <div className="mb-8 flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-card bg-primary text-white">
          <GraduationCap className="size-6" aria-hidden="true" />
        </span>
        <span className="font-display text-xl font-bold">Modern LMS</span>
      </div>

      <Card>
        <CardHeader title="Choose a new password" />
        <CardContent>
          <ResetPasswordForm onSubmit={resetPassword} />
        </CardContent>
      </Card>
    </main>
  );
}
