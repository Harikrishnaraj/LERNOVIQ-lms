import { Skeleton } from "@/components/ui/skeleton";

export default function LessonLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="mx-auto max-w-7xl space-y-4 px-4 py-6">
      <span className="sr-only">Loading lesson…</span>
      <Skeleton className="h-8 w-72" />
      <div className="flex flex-col gap-6 lg:flex-row">
        <Skeleton className="h-96 flex-1" />
        <Skeleton className="h-96 lg:w-80" />
      </div>
    </div>
  );
}
