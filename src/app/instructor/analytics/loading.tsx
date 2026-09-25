import { Skeleton } from "@/components/ui/skeleton";

export default function InstructorAnalyticsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading instructor analytics">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-9 w-44 rounded-control" />
          <Skeleton className="h-9 w-32 rounded-control" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-24 rounded-card" />
        <Skeleton className="h-24 rounded-card" />
        <Skeleton className="h-24 rounded-card" />
        <Skeleton className="h-24 rounded-card" />
      </div>
      <Skeleton className="h-64 rounded-card" />
      <Skeleton className="h-72 rounded-card" />
    </div>
  );
}
