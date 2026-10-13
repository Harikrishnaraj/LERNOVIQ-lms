import { Skeleton } from "@/components/ui/skeleton";

export default function AiTutorLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4">
      <span className="sr-only">Loading the AI Tutor…</span>
      <Skeleton className="h-8 w-48" />
      <div className="flex flex-col gap-6 lg:flex-row">
        <Skeleton className="h-96 flex-1" />
        <Skeleton className="h-48 w-full lg:w-72" />
      </div>
    </div>
  );
}
