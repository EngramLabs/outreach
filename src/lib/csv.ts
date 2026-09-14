// CSV parsing/serialization without external dependencies (spec §30: keep
// dependencies light). Handles quoted fields, escaped quotes, CRLF.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, ""); // strip BOM

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      // handled by the following \n
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop completely empty rows (trailing newlines etc.)
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export function csvEscape(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(
  headers: string[],
  rows: (string | number | null | undefined)[][],
): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

/** Best-effort header → field mapping suggestions for CSV import. */
export function suggestMapping(headers: string[]): Record<string, string> {
  const patterns: [RegExp, string][] = [
    [/^first[\s_-]*name$/i, "firstName"],
    [/^given[\s_-]*name$/i, "firstName"],
    [/^last[\s_-]*name$/i, "lastName"],
    [/^surname$/i, "lastName"],
    [/^family[\s_-]*name$/i, "lastName"],
    [/^full[\s_-]*name$/i, "fullName"],
    [/^name$/i, "fullName"],
    [/^(job[\s_-]*)?title$/i, "jobTitle"],
    [/^position$/i, "jobTitle"],
    [/^role$/i, "jobTitle"],
    [/^company([\s_-]*name)?$/i, "companyName"],
    [/^(linkedin|li)[\s_-]*(url|profile|link)?$/i, "linkedinUrl"],
    [/^(e-?mail|mail|email[\s_-]*address)$/i, "email"],
    [/^location$/i, "location"],
    [/^city$/i, "location"],
    [/^(linkedin)?[\s_-]*url$/i, "linkedinUrl"],
    [/^notes$/i, "notes"],
    [/^tags?$/i, "tags"],
    [/^(utm[\s_-]*)?source$/i, "source"],
    [/^(fit[\s_-]*)?score$/i, "fitScore"],
    [/^campaign([\s_-]*name)?$/i, "campaignName"],
  ];
  const mapping: Record<string, string> = {};
  for (const h of headers) {
    for (const [re, field] of patterns) {
      if (re.test(h.trim())) {
        // first matching field wins; avoid double-assignment
        if (!Object.values(mapping).includes(field)) {
          mapping[h] = field;
        }
        break;
      }
    }
  }
  return mapping;
}
