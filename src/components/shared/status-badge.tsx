"use client";

// Semantic badges. Color carries GROUP meaning only; the label is always
// visible so color is never the sole indicator (WCAG). Tones are defined in
// globals.css tokens.

import { cn } from "@/lib/utils";
import { STATUS_GROUPS, type ProspectStatus } from "@/lib/constants";

const GROUP_CLASS: Record<string, string> = {
  research: "tone-research",
  ready: "tone-ready",
  active: "tone-active",
  responding: "tone-responding",
  "closed-negative": "tone-negative",
  archived: "tone-archived",
};

const GROUP_DOT: Record<string, string> = {
  research: "bg-[var(--tone-research-fg)]/70",
  ready: "bg-[var(--tone-ready-fg)]",
  active: "bg-[var(--tone-active-fg)]",
  responding: "bg-[var(--tone-responding-fg)]",
  "closed-negative": "bg-[var(--tone-negative-fg)]",
  archived: "bg-[var(--tone-archived-fg)]/60",
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const group = STATUS_GROUPS[status as ProspectStatus] ?? "research";
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap",
        GROUP_CLASS[group],
        className,
      )}
      title={`Status: ${status}`}
    >
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-[2px]", GROUP_DOT[group])} />
      {status}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  if (priority === "High") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-warning" title="High priority">
        <svg aria-hidden viewBox="0 0 10 10" className="size-2.5 fill-current">
          <path d="M5 0l1.7 3.3L10 4l-2.5 2.4L8 10 5 8.2 2 10l.5-3.6L0 4l3.3-.7z" />
        </svg>
        High
      </span>
    );
  }
  if (priority === "Low") {
    return (
      <span className="inline-flex items-center text-[11px] text-muted-foreground" title="Low priority">
        Low
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-[11px] text-muted-foreground" title="Medium priority">
      Medium
    </span>
  );
}

export function VerificationBadge({ status }: { status: string | null }) {
  const label = status ?? "Unverified";
  const cls =
    label === "Verified"
      ? "tone-ready"
      : label === "Partial"
        ? "tone-active"
        : "tone-research";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] font-medium leading-4",
        cls,
      )}
      title={`Verification: ${label}`}
    >
      {label === "Verified" ? (
        <svg aria-hidden viewBox="0 0 12 12" className="size-2.5">
          <path d="M1.5 6.5l2.5 2.5 6-6.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ) : label === "Partial" ? (
        <svg aria-hidden viewBox="0 0 12 12" className="size-2.5">
          <rect x="1" y="1" width="10" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M1 6h10" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      ) : null}
      {label}
    </span>
  );
}

const ACTIVITY_TONE: Record<string, string> = {
  "Connection Request": "tone-active",
  "Connection Accepted": "tone-ready",
  "Message Sent": "tone-active",
  "Follow-Up Sent": "tone-active",
  "Reply Received": "tone-responding",
  Meeting: "tone-responding",
  Research: "tone-research",
  Verification: "tone-ready",
  Email: "tone-active",
  Note: "tone-research",
  "Status Change": "tone-research",
  Other: "tone-research",
};

export function ActivityTypeBadge({ type }: { type: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap",
        ACTIVITY_TONE[type] ?? "tone-research",
      )}
    >
      {type}
    </span>
  );
}

export function DQSeverityBadge({ severity }: { severity: "high" | "medium" | "low" }) {
  const cls =
    severity === "high"
      ? "tone-negative"
      : severity === "medium"
        ? "tone-active"
        : "tone-research";
  const label = severity === "high" ? "High" : severity === "medium" ? "Medium" : "Low";
  return (
    <span className={cn("inline-flex items-center rounded-sm px-1.5 py-0.5 text-[11px] font-medium leading-4", cls)}>
      {label}
    </span>
  );
}
