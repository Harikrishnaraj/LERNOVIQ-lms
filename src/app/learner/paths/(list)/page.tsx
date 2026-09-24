import type { Metadata } from "next";
import Link from "next/link";
import { Route } from "lucide-react";
import { EmptyState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { listPaths } from "@/features/paths/paths";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Learning Paths" };

export default async function LearningPathsPage() {
  const paths = await listPaths(await createClient());
  const mine = paths.filter((p) => p.enrolled);
  const others = paths.filter((p) => !p.enrolled);

  const card = (p: (typeof paths)[number]) => {
    const percent = p.courseCount === 0 ? 0 : Math.round((p.completedCount / p.courseCount) * 100);
    return (
      <li key={p.pathId}>
        <Card className="flex h-full flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-semibold">
              <Link href={`/learner/paths/${p.slug}`} className="hover:underline">
                {p.title}
              </Link>
            </h3>
            {p.enrolled && <Badge tone="info">Following</Badge>}
          </div>
          {p.description && <p className="line-clamp-2 text-sm text-text-secondary">{p.description}</p>}
          <p className="text-xs text-text-secondary">
            {p.courseCount} {p.courseCount === 1 ? "course" : "courses"}
          </p>
          {p.enrolled && (
            <div className="space-y-1">
              <Progress value={percent} label={`Progress in ${p.title}`} />
              <p className="text-xs text-text-secondary">
                {p.completedCount} of {p.courseCount} completed · {percent}%
              </p>
            </div>
          )}
          <div className="mt-auto">
            <Link href={`/learner/paths/${p.slug}`} className={buttonClasses({ size: "sm", variant: p.enrolled ? "primary" : "secondary" })}>
              {p.enrolled ? "Continue path" : "View path"}
              <span className="sr-only"> {p.title}</span>
            </Link>
          </div>
        </Card>
      </li>
    );
  };

  return (
    <>
      <PageHeader title="Learning Paths" description="Curated sequences of courses that build on each other." />
      {paths.length === 0 ? (
        <EmptyState icon={Route} title="No learning paths yet" description="Paths will appear here once they are published." />
      ) : (
        <div className="space-y-8">
          {mine.length > 0 && (
            <section aria-labelledby="mine-heading">
              <h2 id="mine-heading" className="mb-3 text-base font-semibold">
                Your paths
              </h2>
              <ul className="grid gap-4 md:grid-cols-2">{mine.map(card)}</ul>
            </section>
          )}
          {others.length > 0 && (
            <section aria-labelledby="all-heading">
              <h2 id="all-heading" className="mb-3 text-base font-semibold">
                {mine.length > 0 ? "More paths" : "All paths"}
              </h2>
              <ul className="grid gap-4 md:grid-cols-2">{others.map(card)}</ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}
