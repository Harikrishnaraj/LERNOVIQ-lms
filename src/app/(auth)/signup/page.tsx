import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SignUpForm } from "@/components/forms/signup-form";
import { AuthDivider, GoogleSignInButton } from "@/components/forms/google-sign-in-button";
import { signUp } from "@/features/auth/sign-up";
import { BrandLogo } from "@/components/brand/brand-logo";

export const metadata = { title: "Sign up" };

export default function SignUpPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-16">
      <div className="mb-6 flex justify-center">
        <BrandLogo width={200} />
      </div>

      <Card>
        <CardHeader title="Create your account" description="Start learning in minutes." />
        <CardContent>
          <GoogleSignInButton label="Sign up with Google" />
          <AuthDivider />
          <SignUpForm onSubmit={signUp} />
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-sm text-text-secondary">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
