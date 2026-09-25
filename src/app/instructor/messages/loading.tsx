import { Skeleton } from "@/components/ui/skeleton";

export default function InstructorMessagesLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading messages">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid gap-6 md:grid-cols-12 min-h-[500px]">
        <div className="md:col-span-4 space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-20 w-full rounded-card" />
          <Skeleton className="h-20 w-full rounded-card" />
          <Skeleton className="h-20 w-full rounded-card" />
        </div>
        <div className="md:col-span-8">
          <Skeleton className="h-[450px] w-full rounded-card" />
        </div>
      </div>
    </div>
  );
}
