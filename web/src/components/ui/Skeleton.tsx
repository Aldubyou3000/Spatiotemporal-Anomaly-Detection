import { cn } from "@/lib/cn";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-surface-muted",
        "after:absolute after:inset-0 after:bg-gradient-to-r",
        "after:from-transparent after:via-white/20 after:to-transparent",
        "after:animate-[sweep_1.4s_ease-in-out_infinite]",
        className
      )}
    />
  );
}

export function TicketRowSkeleton() {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3.5 border-b border-border last:border-b-0">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
        <Skeleton className="h-3 w-28" />
      </div>
      <Skeleton className="h-3 w-20" />
    </div>
  );
}
