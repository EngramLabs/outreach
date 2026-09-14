"use client";

// Date rendering helpers: relative labels with full dates on the title
// (hover) plus visible absolute dates where precision matters.

import { format, formatDistanceToNowStrict, isToday, isTomorrow, isYesterday } from "date-fns";
import { cn } from "@/lib/utils";

export function DateLabel({
  date,
  className,
  withTime = false,
}: {
  date: string | Date | null | undefined;
  className?: string;
  withTime?: boolean;
}) {
  if (!date) return <span className={cn("text-muted-foreground/50", className)}>—</span>;
  const d = typeof date === "string" ? new Date(date) : date;
  const full = withTime ? format(d, "MMM d, yyyy, HH:mm") : format(d, "EEE, MMM d, yyyy");
  const relative = formatDistanceToNowStrict(d, { addSuffix: true });
  return (
    <time dateTime={d.toISOString()} title={`${full} (${relative})`} className={cn("font-num text-[12.5px]", className)}>
      {format(d, "MMM d, yyyy")}
    </time>
  );
}

/** Follow-up due dates: overdue = danger, today = warning, future = default. */
export function DueDateLabel({ date }: { date: string | Date | null | undefined }) {
  if (!date) return <span className="text-muted-foreground/50">—</span>;
  const d = typeof date === "string" ? new Date(date) : date;
  const full = format(d, "EEE, MMM d, yyyy");

  let label = format(d, "MMM d");
  let cls = "text-muted-foreground";
  if (isYesterday(d)) {
    label = "Yesterday";
    cls = "font-medium text-destructive";
  } else if (isToday(d)) {
    label = "Today";
    cls = "font-medium text-warning";
  } else if (isTomorrow(d)) {
    label = "Tomorrow";
    cls = "font-medium text-foreground";
  } else if (d < new Date()) {
    label = format(d, "MMM d");
    cls = "font-medium text-destructive";
  }

  return (
    <time dateTime={d.toISOString()} title={full} className={cn("font-num text-[12.5px]", cls)}>
      {label}
    </time>
  );
}

export function timeAgo(date: string | Date): string {
  return formatDistanceToNowStrict(typeof date === "string" ? new Date(date) : date, {
    addSuffix: true,
  });
}

export function formatDate(date: string | Date | null | undefined, pattern = "MMM d, yyyy"): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, pattern);
}
