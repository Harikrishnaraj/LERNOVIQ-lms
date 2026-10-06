import { Skeleton } from "@/components/ui/skeleton";

export default function GradeAttemptLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading the attempt">
      <Skeleton className="h-4 w-32" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="max-w-3xl space-y-3">
        <Skeleton className="h-24 w-full rounded-card" />
        <Skeleton className="h-40 w-full rounded-card" />
        <Skeleton className="h-40 w-full rounded-card" />
      </div>
    </div>
  );
}
