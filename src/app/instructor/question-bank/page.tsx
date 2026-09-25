import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Library } from "lucide-react";
import { BankManager } from "@/components/course-authoring/bank-manager";
import { EmptyState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QUESTION_TYPES } from "@/features/course-authoring/assessment-rules";
import { listBankItems, listBankTags, parseBankQuery } from "@/features/question-bank/bank";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Question Bank" };

export default async function QuestionBankPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = parseBankQuery(await searchParams);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [items, tags] = await Promise.all([listBankItems(supabase, query), listBankTags(supabase)]);
  const filtered = query.q !== "" || query.tag !== "" || query.type !== "";

  return (
    <>
      <PageHeader title="Question Bank" description="Reusable questions you can import into any of your assessments." />

      <form method="get" action="/instructor/question-bank" role="search" className="mb-4 flex flex-wrap items-end gap-2">
        <div className="min-w-48 max-w-sm flex-1">
          <Input label="Search questions" type="search" name="q" defaultValue={query.q} maxLength={100} />
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Type
          <select name="type" defaultValue={query.type} className="h-10 rounded-input border border-border bg-surface px-3 text-sm font-normal">
            <option value="">All types</option>
            {QUESTION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        {query.tag && <input type="hidden" name="tag" value={query.tag} />}
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {filtered && (
          <Link href="/instructor/question-bank" className={buttonClasses({ variant: "secondary" })}>
            Clear
          </Link>
        )}
      </form>

      {tags.length > 0 && (
        <nav aria-label="Filter by tag" className="mb-6 flex flex-wrap gap-2">
          {tags.map((t) => (
            <Link
              key={t.tag}
              href={`/instructor/question-bank?tag=${encodeURIComponent(t.tag)}`}
              aria-current={t.tag === query.tag ? "true" : undefined}
              className={cn("rounded-full border px-3 py-1 text-xs", t.tag === query.tag ? "border-primary bg-primary-light text-primary-dark" : "border-border text-text-secondary hover:bg-border-subtle")}
            >
              {t.tag} ({t.count})
            </Link>
          ))}
        </nav>
      )}

      {items.length === 0 && !filtered ? (
        <div className="space-y-4">
          <EmptyState icon={Library} title="Your question bank is empty" description="Add questions here, or save them from an assessment, then import them wherever you need them." />
          <BankManager items={[]} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={Library} title="No questions match" description="Try another search, type or tag." />
      ) : (
        <BankManager items={items} />
      )}
    </>
  );
}
