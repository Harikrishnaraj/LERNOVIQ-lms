import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LoginForm } from "@/components/forms/login-form";
import { login } from "@/features/auth/login";

export const metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-16">
      <div className="mb-8 flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-card bg-primary text-white">
          <GraduationCap className="size-6" aria-hidden="true" />
        </span>
        <span className="font-display text-xl font-bold">Modern LMS</span>
      </div>

      <Card>
        <CardHeader title="Welcome back" description="Log in to continue learning." />
        <CardContent>
          <LoginForm onSubmit={login} />
        </CardContent>
      </Card>

      <p className="mt-3 text-center text-sm">
        <Link href="/forgot-password" className="font-medium text-primary hover:underline">
          Forgot password?
        </Link>
      </p>
      <p className="mt-3 text-center text-sm text-text-secondary">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Sign up
        </Link>
      </p>
    </main>
  );
}
