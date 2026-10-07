import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ResetPasswordForm } from "@/components/forms/reset-password-form";
import { resetPassword } from "@/features/auth/reset-password";
import { BrandLogo } from "@/components/brand/brand-logo";

export const metadata = { title: "Reset password" };

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-16">
      <div className="mb-6 flex justify-center">
        <BrandLogo width={200} />
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
