// Normalization helpers shared by import, dedupe, and data-quality logic.

/** Company dedupe key: lowercase, strip punctuation/whitespace/legal suffixes. */
export function normalizeCompanyName(name: string): string {
  const legalSuffixes = [
    "inc", "inc.", "llc", "ltd", "ltd.", "limited", "gmbh", "corp", "corp.",
    "co", "company", "plc", "sa", "sas", "bv", "ag", "ab", "as", "oy", "oyj",
    "group", "holdings", "partners", "srl", "spa", "pvt", "pte",
  ];
  let s = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Drop trailing legal suffixes repeatedly ("Meridian Freight Systems Ltd" -> "meridian freight systems")
  let parts = s.split(" ");
  while (parts.length > 1 && legalSuffixes.includes(parts[parts.length - 1])) {
    parts = parts.slice(0, -1);
  }
  return parts.join(" ");
}

/** Canonical person name for fuzzy duplicate detection. */
export function normalizePersonName(first: string, last?: string | null): string {
  return `${first} ${last ?? ""}`
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalize a LinkedIn profile URL for comparison (trailing slash, http, www). */
export function normalizeLinkedinUrl(url: string): string {
  let u = url.trim().toLowerCase();
  if (!u) return "";
  if (!/^https?:\/\//.test(u)) u = `https://${u}`;
  u = u.replace(/^https?:\/\/(www\.|m\.)?linkedin\.com\//, "linkedin.com/");
  u = u.replace(/\/(about|details|activity|recent-activity)\/?$/, "/");
  u = u.replace(/\/+$/, "");
  // Normalize trailing path junk after /in/<slug>/
  const m = u.match(/^(linkedin\.com\/in\/[^\/]+)(\/.*)?$/);
  if (m) return m[1];
  return u;
}

export function isValidLinkedinUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  if (!u) return false;
  if (!/^https?:\/\/([\w-]+\.)?linkedin\.com\/(in|pub|company)\/[\w\-%./]+$/i.test(u)) {
    return /^linkedin\.com\/(in|pub)\/[\w\-%./]+$/i.test(normalizeLinkedinUrl(u));
  }
  return true;
}

export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export function splitTags(tags: string | null | undefined): string[] {
  if (!tags) return [];
  return tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export function joinTags(tags: string[]): string {
  return Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean))).join(",");
}

/** Start of local day (no UTC off-by-one at midnight). */
export function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function endOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

export function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}
