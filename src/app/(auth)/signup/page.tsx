import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SignUpForm } from "@/components/forms/signup-form";
import { signUp } from "@/features/auth/sign-up";

export const metadata = { title: "Sign up" };

export default function SignUpPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-16">
      <div className="mb-8 flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-card bg-primary text-white">
          <GraduationCap className="size-6" aria-hidden="true" />
        </span>
        <span className="font-display text-xl font-bold">Modern LMS</span>
      </div>

      <Card>
        <CardHeader title="Create your account" description="Start learning in minutes." />
        <CardContent>
          <SignUpForm onSubmit={signUp} />
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
