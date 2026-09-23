import Link from "next/link";
import { ArrowRight, GraduationCap, LayoutDashboard, PenTool, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const PORTALS = [
  {
    href: "/learner",
    title: "Learner",
    body: "Discover courses, learn in a focused player, track progress and earn certificates.",
    icon: LayoutDashboard,
  },
  {
    href: "/instructor",
    title: "Instructor",
    body: "Build courses step by step, check readiness and submit for review.",
    icon: PenTool,
  },
  {
    href: "/admin",
    title: "Admin",
    body: "Review courses, manage users and organizations, and audit every privileged action.",
    icon: ShieldCheck,
  },
] as const;

// Temporary entry point until Phase 1 adds /login and role-aware redirects (T-018).
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col justify-center px-4 py-16 md:px-6">
      <div className="mb-10 flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-card bg-primary text-white">
          <GraduationCap className="size-6" aria-hidden="true" />
        </span>
        <span className="font-display text-xl font-bold">Modern LMS</span>
        <Badge tone="warning" dot className="ml-auto">
          Phase 0 preview
        </Badge>
      </div>

      <h1 className="max-w-2xl text-3xl font-extrabold tracking-tight md:text-4xl">
        One platform. Three workspaces built for the job.
      </h1>
      <p className="mt-3 max-w-2xl text-text-secondary">
        Authentication arrives in Phase 1. Until then, each portal shell is open for review.
      </p>

      <ul className="mt-10 grid gap-4 md:grid-cols-3">
        {PORTALS.map(({ href, title, body, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className="group block h-full rounded-card">
              <Card className="h-full p-5 transition-colors group-hover:border-primary">
                <Icon className="size-6 text-primary" aria-hidden="true" />
                <h2 className="mt-4 text-lg font-bold">{title}</h2>
                <p className="mt-1.5 text-sm text-text-secondary">{body}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                  Open {title.toLowerCase()} portal
                  <ArrowRight
                    className="size-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
