// Domain constants. Single source of truth for statuses, activity types,
// and their semantic groupings. The UI maps these groups to a restrained
// semantic palette (see DESIGN.md) — statuses never get 15 random colors.

export const PROSPECT_STATUSES = [
  "Researching",
  "Needs Verification",
  "Verified",
  "Ready",
  "Request Sent",
  "Connected",
  "Messaged",
  "Follow-Up",
  "Replied",
  "Meeting",
  "Converted",
  "Not Interested",
  "No Response",
  "Archived",
] as const;

export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];

// Semantic grouping — drives badge tone. Color carries grouping only;
// the label is always shown (color is never the only indicator).
export type StatusGroup =
  | "research" // early pipeline
  | "ready" // verified / cleared for outreach
  | "active" // outreach in flight
  | "responding" // positive response states
  | "closed-negative" // negative outcomes
  | "archived";

export const STATUS_GROUPS: Record<ProspectStatus, StatusGroup> = {
  "Researching": "research",
  "Needs Verification": "research",
  "Verified": "ready",
  "Ready": "ready",
  "Request Sent": "active",
  "Connected": "active",
  "Messaged": "active",
  "Follow-Up": "active",
  "Replied": "responding",
  "Meeting": "responding",
  "Converted": "responding",
  "Not Interested": "closed-negative",
  "No Response": "closed-negative",
  "Archived": "archived",
};

// Pipeline order used by dashboard/analytics tables.
export const PIPELINE_ORDER: ProspectStatus[] = [
  "Researching",
  "Needs Verification",
  "Verified",
  "Ready",
  "Request Sent",
  "Connected",
  "Messaged",
  "Replied",
  "Meeting",
  "Converted",
];

export const ACTIVITY_TYPES = [
  "Research",
  "Verification",
  "Connection Request",
  "Connection Accepted",
  "Message Sent",
  "Follow-Up Sent",
  "Reply Received",
  "Meeting",
  "Email",
  "Note",
  "Status Change",
  "Other",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

// Types that represent the operator physically touching LinkedIn.
export const CONTACT_ACTIVITY_TYPES: ActivityType[] = [
  "Connection Request",
  "Message Sent",
  "Follow-Up Sent",
  "Email",
  "Meeting",
];

export const PRIORITIES = ["Low", "Medium", "High"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const VERIFICATION_STATUSES = [
  "Unverified",
  "Partial",
  "Verified",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const VERIFIABLE_FIELDS = [
  "name",
  "jobTitle",
  "company",
  "linkedinUrl",
  "email",
  "location",
] as const;
export type VerifiableField = (typeof VERIFIABLE_FIELDS)[number];

export const CAMPAIGN_STATUSES = [
  "Draft",
  "Active",
  "Paused",
  "Completed",
  "Archived",
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const COMPANY_STATUSES = ["Active", "Archived"] as const;

export const PROSPECT_SOURCES = [
  "LinkedIn Search",
  "LinkedIn Post",
  "Event",
  "Referral",
  "Company Website",
  "Sales Navigator",
  "CSV Import",
  "Manual",
] as const;

export const COMPANY_SIZES = [
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "501-1000",
  "1000+",
] as const;

// Follow-up date shortcuts offered across the app (spec §16).
export const FOLLOWUP_SHORTCUTS = [
  { label: "Today", days: 0 },
  { label: "Tomorrow", days: 1 },
  { label: "3 days", days: 3 },
  { label: "1 week", days: 7 },
] as const;

export const DEFAULT_SETTINGS: Record<string, string> = {
  defaultFollowUpDays: "3",
  weeklyConnectionTarget: "40",
  operatorName: "",
  linkedinChecklistUrl: "",
};

export const SETTING_KEYS = [
  "defaultFollowUpDays",
  "weeklyConnectionTarget",
  "operatorName",
  "linkedinChecklistUrl",
] as const;

// Statuses that exclude a prospect from the live follow-up queue.
export const TERMINAL_STATUSES: ProspectStatus[] = [
  "Converted",
  "Not Interested",
  "No Response",
  "Archived",
];
