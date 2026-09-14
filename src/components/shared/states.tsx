"use client";

// Empty / loading / error / stat primitives shared by every view.

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle } from "lucide-react";

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-14 text-center", className)}>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground text-balance">
          {description}
        </p>
      ) : null}
      {action ? (
        <Button size="sm" variant="outline" onClick={action.onClick} className="mt-2">
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn("flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3", className)}
    >
      <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="flex-1">
        <p className="text-[13px] font-medium text-foreground">{message}</p>
        {onRetry ? (
          <Button size="sm" variant="outline" className="mt-2" onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  onClick,
  tone,
}: {
  label: string;
  value: string | number | null;
  hint?: string;
  onClick?: () => void;
  tone?: "default" | "warning" | "success" | "danger";
}) {
  const toneClass =
    tone === "warning"
      ? "text-warning"
      : tone === "danger"
        ? "text-destructive"
        : tone === "success"
          ? "text-success"
          : "text-foreground";

  const content = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {hint ? <span className="text-[11px] text-muted-foreground/80">{hint}</span> : null}
      </div>
      <div className={cn("font-num text-xl font-semibold leading-7 tracking-tight", toneClass)}>
        {value ?? <span className="text-muted-foreground/60">—</span>}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="group flex w-full flex-col gap-0.5 rounded-md border bg-card px-3 py-2.5 text-left transition-colors hover:border-border-strong hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        aria-label={`${label}: ${value ?? "no data"}. Open filtered view.`}
      >
        {content}
      </button>
    );
  }
  return (
    <div className="flex w-full flex-col gap-0.5 rounded-md border bg-card px-3 py-2.5">
      {content}
    </div>
  );
}

export function SectionHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function TableSkeleton({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div role="status" aria-label="Loading data" className="rounded-md border bg-card">
      <div className="flex gap-4 border-b bg-surface-subtle/60 px-3 py-2.5">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 border-b px-3 py-3 last:border-0">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="h-4 flex-1" style={{ opacity: 1 - r * 0.06 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardsSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div role="status" aria-label="Loading" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="rounded-md border bg-card px-3 py-2.5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-2 h-7 w-12" />
        </div>
      ))}
    </div>
  );
}
