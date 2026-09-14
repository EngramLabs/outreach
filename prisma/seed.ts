// Seed: realistic sample fixtures for development (spec §41).
// Deliberately includes data-quality scenarios the DQ scan must detect:
// duplicate LinkedIn URL, duplicate email, same-name duplicate person,
// duplicate company, Connected without accepted date, Request Sent without
// request date, Converted without closing activity, impossible date order,
// missing fields, malformed URL.
//
// Run: bun prisma/seed.ts

import { PrismaClient } from "@prisma/client";
import { scryptSync, randomBytes } from "crypto";

const db = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const daysAgo = (n: number, hour = 10): Date => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 24, 0, 0);
  return d;
};
const inDays = (n: number): Date => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(9, 0, 0, 0);
  return d;
};

// ---------------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------------
const companies = [
  { key: "meridian", name: "Meridian Freight Systems", website: "https://meridianfreight.com", linkedin: "https://www.linkedin.com/company/meridian-freight-systems", industry: "Logistics & Supply Chain", location: "Chicago, IL", size: "201-500", source: "LinkedIn Search" },
  { key: "meridian-dup", name: "Meridian Freight Systems Ltd", website: "https://meridianfreight.com", linkedin: null, industry: "Logistics", location: "Chicago, Illinois", size: "201-500", source: "CSV Import" }, // DQ: duplicate company
  { key: "brightpath", name: "Brightpath Analytics", website: "https://brightpathanalytics.io", linkedin: "https://www.linkedin.com/company/brightpath-analytics", industry: "Data & Analytics", location: "Austin, TX", size: "11-50", source: "Referral" },
  { key: "halcyon", name: "Halcyon Insurance Group", website: "https://halcyoninsurance.com", linkedin: "https://www.linkedin.com/company/halcyon-insurance-group", industry: "Insurance", location: "Hartford, CT", size: "1000+", source: "Sales Navigator" },
  { key: "terranova", name: "TerraNova Renewables", website: "https://terranovarenew.com", linkedin: "https://www.linkedin.com/company/terranova-renewables", industry: "Renewable Energy", location: "Denver, CO", size: "201-500", source: "Event" },
  { key: "loomledger", name: "Loom & Ledger", website: "https://loomledger.co.uk", linkedin: "https://www.linkedin.com/company/loom-and-ledger", industry: "Accounting Services", location: "Manchester, UK", size: "11-50", source: "LinkedIn Post" },
  { key: "copperline", name: "Copperline Manufacturing", website: "https://copperlinemfg.com", linkedin: "https://www.linkedin.com/company/copperline-manufacturing", industry: "Industrial Manufacturing", location: "Detroit, MI", size: "501-1000", source: "LinkedIn Search" },
  { key: "willowfinch", name: "Willow & Finch Consulting", website: "https://willowandfinch.com", linkedin: "https://www.linkedin.com/company/willow-finch-consulting", industry: "Management Consulting", location: "London, UK", size: "51-200", source: "Referral" },
  { key: "northgate", name: "Northgate Health Partners", website: "https://northgatehealth.org", linkedin: "https://www.linkedin.com/company/northgate-health-partners", industry: "Hospital & Health Care", location: "Boston, MA", size: "1000+", source: "Sales Navigator" },
  { key: "sorrento", name: "Sorrento Foods International", website: "https://sorrentofoods.it", linkedin: "https://www.linkedin.com/company/sorrento-foods-international", industry: "Food Production", location: "Milan, Italy", size: "501-1000", source: "Company Website" },
  { key: "polaris", name: "Polaris Legal Search", website: "https://polarislegalsearch.com", linkedin: "https://www.linkedin.com/company/polaris-legal-search", industry: "Legal Services", location: "Chicago, IL", size: "11-50", source: "LinkedIn Search" },
  { key: "arcline", name: "Arcline Media Group", website: "https://arclinemedia.de", linkedin: "https://www.linkedin.com/company/arcline-media-group", industry: "Advertising Services", location: "Berlin, Germany", size: "51-200", source: "LinkedIn Post" },
  { key: "stratified", name: "Stratified Cloudworks", website: "https://stratifiedcloud.com", linkedin: "https://www.linkedin.com/company/stratified-cloudworks", industry: "Software Development", location: "Seattle, WA", size: "201-500", source: "Sales Navigator" },
];

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------
const campaigns = [
  { key: "saas", name: "Q1 SaaS Founders", description: "Founders and VPs at B2B SaaS companies under 500 people. Angle: operator-heavy outreach workflows.", audience: "Founders, VPs Ops/Growth at B2B SaaS (11-500)", status: "Active", started: 41 },
  { key: "freight", name: "Freight Ops Leaders", description: "Supply-chain and logistics leadership. Angle: replacing spreadsheet-driven prospect tracking.", audience: "VP/Director Supply Chain, Logistics, Ops", status: "Active", started: 33 },
  { key: "uk", name: "UK Agency Growth", description: "UK agency owners and practice leads. Angle: disciplined outreach without a sales team.", audience: "Agency owners & practice leads, UK", status: "Paused", started: 72 },
];

// ---------------------------------------------------------------------------
// Prospects
// history: [activityType, daysAgo, notes?, messageText?]
// fq: days from now for next follow-up (negative = overdue); omit = no date
// ---------------------------------------------------------------------------
interface SeedProspect {
  first: string; last?: string | null; title?: string | null; company?: string | null;
  linkedin?: string | null; email?: string | null; location?: string; source?: string;
  campaign?: string; status: string; priority?: "Low" | "Medium" | "High";
  fit?: number; research?: string; angle?: string; notes?: string; tags?: string;
  added: number;
  history?: [string, number, (string | null)?, (string | null)?][];
  fq?: number;
  archivedDaysAgo?: number;
  // DQ flags
  skipAcceptedDate?: boolean; skipRequestDate?: boolean;
  noConversionActivity?: boolean; impossibleDates?: boolean;
}

const prospects: SeedProspect[] = [
  // --- Converted / Meeting / Replied (mature histories) ---
  {
    first: "Sarah", last: "Kellerman", title: "VP of Supply Chain Strategy", company: "meridian",
    linkedin: "https://www.linkedin.com/in/sarah-kellerman-0417", email: "s.kellerman@meridianfreight.com",
    location: "Chicago, IL", source: "Sales Navigator", campaign: "freight", status: "Converted", priority: "High", fit: 88,
    angle: "Commented twice on her posts about port congestion — open with that.",
    notes: "Runs a 6-person ops team drowning in spreadsheets. Asked for the workflow doc.",
    added: 62, fq: 14,
    history: [
      ["Research", 60, "Found via her comment on the Flexport thread."],
      ["Verification", 58, "Cross-checked title on company site leadership page."],
      ["Connection Request", 55],
      ["Connection Accepted", 52],
      ["Message Sent", 51, null, "Hi Sarah — following your port congestion thread. We replaced my old spreadsheet pipeline with a tracked queue; happy to share how the workflow runs if useful?"],
      ["Reply Received", 47, null, "Happy to take a look — we're all in spreadsheets over here."],
      ["Follow-Up Sent", 44, null, "Sent the follow-up with the workflow breakdown."],
      ["Meeting", 40, "30-min call. She'll pilot with the ops team after QBR."],
      ["Note", 12, "Pilot kicked off. Check results at the 60-day mark."],
    ],
  },
  {
    first: "Daniel", last: "Okafor", title: "Head of Data & Analytics", company: "brightpath",
    linkedin: "https://www.linkedin.com/in/daniel-okafor-72a", email: "d.okafor@brightpathanalytics.io",
    location: "Austin, TX", source: "Referral", campaign: "saas", status: "Meeting", priority: "High", fit: 84,
    angle: "Referred by Priya at Stratified. Warm intro available.",
    notes: "Wants a second meeting with their ops lead.",
    added: 38, fq: 3,
    history: [
      ["Research", 37, "Referred by Priya Nandakumar (Stratified)."],
      ["Connection Request", 35],
      ["Connection Accepted", 33],
      ["Message Sent", 32, null, "Hi Daniel — Priya suggested we connect. She mentioned your team tracks outreach in a shared sheet; curious what breaks first at your volume."],
      ["Reply Received", 28, null, "The sheet breaks around 200 rows, honestly. Send me what you have."],
      ["Meeting", 21, "First call — 25 min. Interested, looping in ops lead."],
    ],
  },
  {
    first: "Marta", last: "Ferrante", title: "Director of Operations", company: "sorrento",
    linkedin: "https://www.linkedin.com/in/marta-ferrante-1188", email: "m.ferrante@sorrentofoods.it",
    location: "Milan, Italy", source: "LinkedIn Search", campaign: "saas", status: "Replied", priority: "High", fit: 79,
    angle: "Posted about their US expansion — timing angle.",
    added: 45, fq: 0,
    history: [
      ["Research", 44],
      ["Verification", 43, "Title confirmed via company press page."],
      ["Connection Request", 41],
      ["Connection Accepted", 39],
      ["Message Sent", 38, null, "Buongiorno Marta — saw the US expansion announcement. Managing that pipeline across time zones gets messy fast; happy to share the queue system I use."],
      ["Reply Received", 33, null, "Interesting timing — can you send an overview in English?"],
      ["Follow-Up Sent", 30, null, "Sent overview + short Loom."],
    ],
  },
  {
    first: "James", last: "Whitworth", title: "Managing Partner", company: "loomledger",
    linkedin: "https://www.linkedin.com/in/james-whitworth-9901", email: "j.whitworth@loomledger.co.uk",
    location: "Manchester, UK", source: "LinkedIn Post", campaign: "uk", status: "Replied", priority: "Medium", fit: 71,
    angle: "His LinkedIn post about client intake chaos.",
    added: 58, fq: -4,
    history: [
      ["Research", 57],
      ["Connection Request", 54],
      ["Connection Accepted", 50],
      ["Message Sent", 49, null, "Hi James — your post on client intake resonated. We built a tracked queue for exactly that hand-off problem. Worth a look?"],
      ["Reply Received", 42, null, "Send something over after the 15th, tax season is brutal right now."],
    ],
  },
  {
    first: "Anika", last: "Rajagopal", title: "Chief Operating Officer", company: "stratified",
    linkedin: "https://www.linkedin.com/in/anika-rajagopal-55c", email: "anika@stratifiedcloud.com",
    location: "Seattle, WA", source: "Sales Navigator", campaign: "saas", status: "Converted", priority: "High", fit: 91,
    angle: "Ex-operator. Hates CRM overhead — lead with 'less process, not more'.",
    notes: "Signed. Reference-able after 60 days.",
    added: 71,
    history: [
      ["Research", 70],
      ["Connection Request", 68],
      ["Connection Accepted", 66],
      ["Message Sent", 65, null, "Hi Anika — every ops leader I talk to is fighting their CRM more than their pipeline. There's a quieter way to run this. Want the 3-min version?"],
      ["Reply Received", 61, null, "Ha. Yes, actually. Send it."],
      ["Meeting", 55, "Two calls. Decided on the second."],
      ["Meeting", 34, "Wrap-up + kickoff plan."],
    ],
  },
  {
    first: "Thomas", last: "Lindqvist", title: "VP Operations & Continuous Improvement", company: "copperline", // long title
    linkedin: "https://www.linkedin.com/in/thomas-lindqvist-3304", email: "t.lindqvist@copperlinemfg.com",
    location: "Detroit, MI", source: "LinkedIn Search", campaign: "freight", status: "Meeting", priority: "Medium", fit: 76,
    angle: "Lean background — process discipline angle lands well.",
    added: 30, fq: 2,
    history: [
      ["Research", 29],
      ["Connection Request", 27],
      ["Connection Accepted", 24],
      ["Message Sent", 23, null, "Hi Thomas — with your CI background you'll appreciate this: one queue, one status per prospect, zero duplicate data entry. Want the walkthrough?"],
      ["Reply Received", 18, null, "Walk me through it next week?"],
      ["Meeting", 9, "First call. Evaluating against their existing sheet."],
    ],
  },

  // --- Follow-Up / Messaged / Connected (mid pipeline) ---
  {
    first: "Marcus", last: "Webb", title: "Director of Logistics", company: "meridian",
    linkedin: "https://www.linkedin.com/in/marcus-webb-8842", email: "m.webb@meridianfreight.com",
    location: "Chicago, IL", source: "Sales Navigator", campaign: "freight", status: "Follow-Up", priority: "High", fit: 82,
    angle: "Attended Manifest conference — mentioned it in his bio.",
    added: 28, fq: -2,
    history: [
      ["Research", 27],
      ["Connection Request", 25],
      ["Connection Accepted", 21],
      ["Message Sent", 20, null, "Hi Marcus — saw you at Manifest. How are you tracking the carrier outreach pipeline these days?"],
      ["Follow-Up Sent", 8, null, "Bumping this — happy to share the queue template either way."],
    ],
  },
  {
    first: "Marcus", last: "Webb", title: "Director of Logistics", company: "meridian-dup", // DQ: duplicate linkedin
    linkedin: "https://www.linkedin.com/in/marcus-webb-8842/", email: "marcus.webb@meridianfreight.com",
    location: "Chicago, Illinois", source: "CSV Import", status: "Needs Verification", priority: "Low", fit: 40,
    added: 5,
  },
  {
    first: "Priya", last: "Nandakumar", title: "VP of Engineering Operations", company: "stratified",
    linkedin: "https://www.linkedin.com/in/priya-nandakumar-2210", email: "priya.n@stratifiedcloud.com",
    location: "Seattle, WA", source: "Referral", campaign: "saas", status: "Follow-Up", priority: "High", fit: 85,
    angle: "Already referred Daniel — warm network effect.",
    added: 22, fq: 1,
    history: [
      ["Connection Request", 20],
      ["Connection Accepted", 18],
      ["Message Sent", 17, null, "Hi Priya — Daniel's pilot is going well. Curious whether the same queue discipline would help on eng-ops side."],
      ["Follow-Up Sent", 4, null, "Following up — anything useful in the pilot notes I shared?"],
    ],
  },
  {
    first: "Elena", last: "Marchetti", title: "Practice Lead, Digital Transformation", company: "willowfinch",
    linkedin: "https://www.linkedin.com/in/elena-marchetti-7713", email: "e.marchetti@willowandfinch.com",
    location: "London, UK", source: "LinkedIn Post", campaign: "uk", status: "Messaged", priority: "Medium", fit: 73,
    angle: "Publishes a weekly ops newsletter — reply to issue #42.",
    added: 18, fq: 5,
    history: [
      ["Connection Request", 16],
      ["Connection Accepted", 13],
      ["Message Sent", 12, null, "Hi Elena — issue #42 (the one on intake hand-offs) described half my consulting pipeline. Curious how you solve it for clients."],
    ],
  },
  {
    first: "Robert", last: "Neumann", title: "Senior Vice President, Underwriting Operations", company: "halcyon",
    linkedin: "https://www.linkedin.com/in/robert-neumann-448", email: "r.neumann@halcyoninsurance.com",
    location: "Hartford, CT", source: "Sales Navigator", campaign: "saas", status: "Messaged", priority: "Medium", fit: 68,
    angle: "Insurance ops = heavy compliance. Angle: audit trail without CRM bloat.",
    added: 15, fq: 7,
    history: [
      ["Connection Request", 13],
      ["Connection Accepted", 9],
      ["Message Sent", 8, null, "Hi Robert — underwriting pipelines live or die by the follow-up cadence. Happy to share the cadence that's working here."],
    ],
  },
  {
    first: "Sofia", last: "Andersson", title: "Head of Growth", company: "arcline",
    linkedin: "https://www.linkedin.com/in/sofia-andersson-003", email: "s.andersson@arclinemedia.de",
    location: "Berlin, Germany", source: "LinkedIn Post", campaign: "saas", status: "Connected", priority: "Medium", fit: 77,
    angle: "Hiring SDRs — they'll need pipeline discipline before headcount lands.",
    added: 12, fq: 0,
    history: [
      ["Connection Request", 11],
      ["Connection Accepted", 6],
    ],
  },
  {
    first: "Victor", last: "Adeyemi", title: "Operations Manager", company: "terranova",
    linkedin: "https://www.linkedin.com/in/victor-adeyemi-215", email: "v.adeyemi@terranovarenew.com",
    location: "Denver, CO", source: "Event", status: "Connected", priority: "Medium", fit: 64,
    angle: "Met briefly at RE+: Denver — reference the booth chat.",
    added: 14, fq: -6,
    history: [
      ["Connection Request", 13],
      ["Connection Accepted", 8],
    ],
  },
  {
    first: "Grace", last: "Lindström", title: "Chief of Staff", company: "northgate",
    linkedin: "https://www.linkedin.com/in/grace-lindstrom-889", email: "g.lindstrom@northgatehealth.org",
    location: "Boston, MA", source: "Sales Navigator", campaign: "saas", status: "Connected", priority: "Low", fit: 59,
    added: 10, fq: 4,
    history: [
      ["Connection Request", 9],
      ["Connection Accepted", 3],
    ],
  },
  {
    first: "Dmitri", last: "Kovalev", title: "Head of Procurement & Vendor Relations", company: "sorrento",
    linkedin: "https://www.linkedin.com/in/dmitri-kovalev-5510", email: null,
    location: "Milan, Italy", source: "LinkedIn Search", status: "Connected",
    skipAcceptedDate: true, // DQ: Connected without accepted date
    priority: "Medium", fit: 61, added: 16,
    history: [
      ["Connection Request", 15],
    ],
  },

  // --- Request Sent ---
  {
    first: "Hannah", last: "Bergström", title: "Director of Revenue Operations", company: "brightpath",
    linkedin: "https://www.linkedin.com/in/hannah-bergstrom-118", email: "h.bergstrom@brightpathanalytics.io",
    location: "Austin, TX", source: "Sales Navigator", campaign: "saas", status: "Request Sent", priority: "High", fit: 80,
    added: 8,
    history: [
      ["Connection Request", 2],
    ],
  },
  {
    first: "Oliver", last: "Chen-Rowe", title: "Founder & CEO", company: "brightpath",
    linkedin: "https://www.linkedin.com/in/oliver-chen-rowe", email: "oliver@brightpathanalytics.io",
    location: "Austin, TX", source: "Referral", campaign: "saas", status: "Request Sent", priority: "High", fit: 86,
    angle: "Founder-led outreach himself — he'll get the 'serious operator' framing.",
    added: 7,
    history: [
      ["Connection Request", 1],
    ],
  },
  {
    first: "Fatima", last: "Al-Rashid", title: "VP of Client Services", company: "arcline",
    linkedin: "https://www.linkedin.com/in/fatima-al-rashid-772", email: "f.alrashid@arclinemedia.de",
    location: "Berlin, Germany", source: "LinkedIn Search", campaign: "saas", status: "Request Sent", priority: "Medium", fit: 70,
    added: 9,
    history: [
      ["Connection Request", 5],
    ],
  },
  {
    first: "Ken", last: "Takahashi", title: "Director of Business Development, APAC", company: "meridian",
    linkedin: "https://www.linkedin.com/in/ken-takahashi-001", email: "k.takahashi@meridianfreight.com",
    location: "Singapore", source: "LinkedIn Search", campaign: "freight", status: "Request Sent", priority: "Medium", fit: 66,
    skipRequestDate: true, // DQ: Request Sent without request date
    added: 6,
  },
  {
    first: "Beatriz", last: "Fuentes", title: "Supply Chain Program Lead", company: "terranova",
    linkedin: "https://www.linkedin.com/in/beatriz-fuentes-990", email: "b.fuentes@terranovarenew.com",
    location: "Denver, CO", source: "Event", campaign: "freight", status: "Request Sent", priority: "Medium", fit: 63,
    added: 5,
    history: [
      ["Connection Request", 4],
    ],
  },

  // --- Ready / Verified / Needs Verification / Researching ---
  {
    first: "Nadia", last: "Haddad", title: "Operations Director", company: "willowfinch",
    linkedin: "https://www.linkedin.com/in/nadia-haddad-443", email: "n.haddad@willowandfinch.com",
    location: "London, UK", source: "LinkedIn Search", campaign: "uk", status: "Ready", priority: "High", fit: 78,
    angle: "Scaling from 12 to 30 consultants — intake process is breaking.",
    added: 11, fq: 6,
    history: [
      ["Research", 10, "Found via Willow & Finch careers page — they're hiring 8 consultants."],
      ["Verification", 9, "Title and location confirmed on LinkedIn + website."],
    ],
  },
  {
    first: "Peter", last: "Osei", title: "Head of Operations", company: "loomledger",
    linkedin: "https://www.linkedin.com/in/peter-osei-661", email: "p.osei@loomledger.co.uk",
    location: "Manchester, UK", source: "LinkedIn Search", campaign: "uk", status: "Ready", priority: "Medium", fit: 69,
    added: 13,
    history: [
      ["Research", 12],
      ["Verification", 11, "Confirmed via Companies House filings."],
    ],
  },
  {
    first: "Isabelle", last: "Moreau", title: "Directrice des Opérations (COO)", company: "sorrento",
    linkedin: "https://www.linkedin.com/in/isabelle-moreau-220", email: "i.moreau@sorrentofoods.it",
    location: "Lyon, France", source: "Company Website", status: "Ready", priority: "Low", fit: 58,
    added: 20,
    history: [
      ["Research", 19, "From the Sorrento leadership page."],
      ["Verification", 18, "Title checks out; email pattern uncertain (bounced once)."],
    ],
  },
  {
    first: "Ahmed", last: "El-Sayed", title: "Director of Operations", company: "northgate",
    linkedin: "https://www.linkedin.com/in/ahmed-el-sayed-880", email: "a.elsayed@northgatehealth.org",
    location: "Boston, MA", source: "Sales Navigator", status: "Ready", priority: "Medium", fit: 65,
    added: 9,
    history: [
      ["Research", 8],
      ["Verification", 7, "Confirmed via conference speaker bio."],
    ],
  },
  {
    first: "Chloe", last: "Dupont", title: "Analytics Engineering Lead", company: "brightpath",
    linkedin: "https://www.linkedin.com/in/chloe-dupont-334", email: "k.okafor@brightpathanalytics.io", // DQ: duplicate email
    location: "Austin, TX", source: "LinkedIn Search", status: "Needs Verification", priority: "Low", fit: 52,
    added: 4,
    notes: "Email looks wrong — same as K. Okafor? Verify before use.",
  },
  {
    first: "Kwame", last: "Asante", title: "Head of Operations", company: "brightpath",
    linkedin: "https://www.linkedin.com/in/kwame-asante-771", email: "k.asante@brightpathanalytics.io",
    location: "Austin, TX", source: "LinkedIn Search", campaign: "saas", status: "Needs Verification", priority: "Medium", fit: 62,
    added: 6,
    research: "Possible overlap with the duplicate Webb import — check sources.",
  },
  {
    first: "Yuki", last: "Tanaka", title: "Supply Chain Manager", company: "terranova",
    linkedin: "https://www.linkedin.com/in/yuki-tanaka-991", email: null,
    location: "Denver, CO", source: "Event", status: "Needs Verification", priority: "Low", fit: 55,
    added: 3,
  },
  {
    first: "Lucas", last: "Van der Merwe", title: "Senior Operations Analyst", company: "copperline",
    linkedin: "https://www.linkedin.com/in/lucas-vandermerwe-558", email: "l.vandermerwe@copperlinemfg.com",
    location: "Detroit, MI", source: "LinkedIn Search", campaign: "freight", status: "Verified", priority: "Medium", fit: 61,
    angle: "Analyst-level — not a buyer, but a strong internal champion.",
    added: 16,
    history: [
      ["Research", 15],
      ["Verification", 14, "All fields verified against LinkedIn."],
    ],
  },
  {
    first: "Astrid", last: "Nilsen", title: "COO", company: "polaris",
    linkedin: "https://www.linkedin.com/in/astrid-nilsen-007", email: "astrid@polarislegalsearch.com",
    location: "Chicago, IL", source: "LinkedIn Search", status: "Verified", priority: "Medium", fit: 67,
    added: 17,
    history: [
      ["Research", 16],
      ["Verification", 15, "Confirmed — small firm, she IS the buyer."],
    ],
  },
  {
    first: "Mateo", last: "Gutiérrez", title: "Operations Lead", company: null, // DQ: missing company
    linkedin: "https://www.linkedin.com/in/mateo-gutierrez-202", email: null,
    location: "Monterrey, Mexico", source: "LinkedIn Post", status: "Researching", priority: "Low", fit: 48,
    added: 2,
    research: "Commented on a logistics post. Company not listed on profile — check.",
  },
  {
    first: "Freya", last: "Johansson", title: null, // DQ: missing role
    linkedin: "https://www.linkedin.com/in/freya-johansson-330", email: null,
    location: "Stockholm, Sweden", source: "LinkedIn Search", status: "Researching", priority: "Low",
    added: 1,
  },
  {
    first: "Idris", last: "Bello", title: "Managing Director", company: null, // DQ: missing company
    linkedin: null, // DQ: missing linkedin
    email: "idris.bello@premierharbourlogistics.com", location: "Lagos, Nigeria", source: "Referral",
    status: "Researching", priority: "Medium", fit: 54, added: 8,
    research: "Referred by Thomas L. — find his LinkedIn before Request Sent.",
  },
  {
    first: "Rowan", last: "Fitzgerald", title: "Principal", company: "polaris",
    linkedin: "www.linkedincom/in/rowan-fitzgerald-11", // DQ: malformed URL
    email: "r.fitzgerald@polarislegalsearch.com", location: "Chicago, IL", source: "LinkedIn Search",
    status: "Researching", priority: "Low", fit: 50, added: 4,
  },
  {
    first: "Daniel", last: "Fischer", title: "Plant Operations Manager", company: "copperline",
    linkedin: "https://www.linkedin.com/in/daniel-fischer-copperline-01", email: "d.fischer@copperlinemfg.com",
    location: "Detroit, MI", source: "CSV Import", status: "Researching", priority: "Low", fit: 44, added: 3,
  },
  {
    first: "Daniel", last: "Fischer", title: "Operations Manager", company: "copperline", // DQ: same-name duplicate
    linkedin: null, email: null, location: "Detroit, MI", source: "CSV Import",
    status: "Researching", priority: "Low", fit: 44, added: 2,
  },
  {
    first: "Camille", last: "Laurent", title: "Head of Client Operations", company: "willowfinch",
    linkedin: "https://www.linkedin.com/in/camille-laurent-450", email: "c.laurent@willowandfinch.com",
    location: "London, UK", source: "LinkedIn Search", campaign: "uk", status: "Researching", priority: "Medium", fit: 63,
    added: 5,
  },
  {
    first: "Nathan", last: "Bishop", title: "Director of Operations", company: "northgate",
    linkedin: "https://www.linkedin.com/in/nathan-bishop-779", email: "n.bishop@northgatehealth.org",
    location: "Boston, MA", source: "Sales Navigator", campaign: "saas", status: "Researching", priority: "Medium", fit: 60,
    added: 7,
  },
  {
    first: "Leila", last: "Karimi", title: "VP Operations", company: "halcyon",
    linkedin: "https://www.linkedin.com/in/leila-karimi-665", email: "l.karimi@halcyoninsurance.com",
    location: "Hartford, CT", source: "Sales Navigator", campaign: "saas", status: "Researching", priority: "High", fit: 74,
    added: 4,
    research: "Spoke at InsureOps Connect. Panel was about process discipline.",
  },
  {
    first: "Tomasz", last: "Nowicki", title: "Operations and Logistics Manager", company: "sorrento",
    linkedin: "https://www.linkedin.com/in/tomasz-nowicki-880", email: null,
    location: "Warsaw, Poland", source: "LinkedIn Search", campaign: "freight", status: "Researching", priority: "Low", fit: 51,
    added: 6,
  },
  {
    first: "Rebecca", last: "Halloran", title: "Senior Vice President of Operations and Client Delivery", company: "willowfinch", // long title
    linkedin: "https://www.linkedin.com/in/rebecca-halloran-331", email: "r.halloran@willowandfinch.com",
    location: "London, UK", source: "LinkedIn Post", campaign: "uk", status: "Verified", priority: "Medium", fit: 72,
    added: 24,
    history: [
      ["Research", 23],
      ["Verification", 22, "Verified name, role, company, LinkedIn. Email unverified."],
    ],
  },

  // --- Negative / terminal ---
  {
    first: "Greg", last: "Sandoval", title: "Director of Ops", company: "copperline",
    linkedin: "https://www.linkedin.com/in/greg-sandoval-447", email: "g.sandoval@copperlinemfg.com",
    location: "Detroit, MI", source: "LinkedIn Search", campaign: "freight", status: "Not Interested", priority: "Low", fit: 49,
    notes: "Happy with current setup. Re-check in 6 months.",
    added: 35,
    history: [
      ["Connection Request", 33],
      ["Connection Accepted", 30],
      ["Message Sent", 29, null, "Hi Greg — quick one: how is copperline tracking supplier outreach today?"],
      ["Reply Received", 25, null, "We're fine with the current tooling, thanks."],
    ],
  },
  {
    first: "Anna", last: "Kowalczyk", title: "Head of Operations", company: "arcline",
    linkedin: "https://www.linkedin.com/in/anna-kowalczyk-664", email: "a.kowalczyk@arclinemedia.de",
    location: "Berlin, Germany", source: "LinkedIn Search", campaign: "saas", status: "No Response", priority: "Low", fit: 53,
    added: 40,
    history: [
      ["Connection Request", 38],
      ["Connection Accepted", 34],
      ["Message Sent", 33, null, "Hi Anna — your growth team's hiring post suggests pipeline season. Want the cadence template?"],
      ["Follow-Up Sent", 26],
    ],
  },
  {
    first: "Hugo", last: "Mbaye", title: "Operations Consultant", company: "willowfinch",
    linkedin: "https://www.linkedin.com/in/hugo-mbaye-776", email: null,
    location: "London, UK", source: "LinkedIn Post", status: "No Response", priority: "Low", fit: 46,
    added: 48,
    history: [
      ["Connection Request", 46],
      ["Connection Accepted", 41],
      ["Message Sent", 40, null, "Hi Hugo — saw your post on solo consulting ops. The queue system might fit your client intake."],
    ],
  },
  {
    first: "Veronica", last: "Bianchi", title: "Head of Operations", company: "northgate",
    linkedin: "https://www.linkedin.com/in/veronica-bianchi-229", email: "v.bianchi@northgatehealth.org",
    location: "Boston, MA", source: "Sales Navigator", campaign: "saas", status: "Converted", priority: "Medium", fit: 70,
    noConversionActivity: true, // DQ: Converted without closing activity
    added: 55,
    notes: "Imported from an old tracker — conversion happened pre-migration.",
  },
  {
    first: "Simon", last: "Adeoye", title: "Logistics Coordinator", company: "meridian-dup",
    linkedin: "https://www.linkedin.com/in/simon-adeoye-992", email: "s.adeoye@meridianfreight.com",
    location: "Chicago, IL", source: "CSV Import", status: "Archived", priority: "Low",
    archivedDaysAgo: 6, added: 15,
    notes: "Archived — entry-level role, not a buyer.",
    history: [["Note", 10, "Too junior — archived."]],
  },
  {
    first: "Catherine", last: "Boucher", title: "Operations Manager", company: "terranova",
    linkedin: "https://www.linkedin.com/in/catherine-boucher-110", email: "c.boucher@terranovarenew.com",
    location: "Denver, CO", source: "Event", status: "Archived", priority: "Low",
    archivedDaysAgo: 12, added: 70,
    notes: "Left the company — company confirmed via LinkedIn.",
    history: [["Note", 13, "Saw departure announcement. Archiving."]],
  },
  {
    first: "Felix", last: "Braun", title: "Supply Chain Director", company: "sorrento",
    linkedin: "https://www.linkedin.com/in/felix-braun-impossible", email: "f.braun@sorrentofoods.it",
    location: "Milan, Italy", source: "CSV Import", status: "Messaged", priority: "Low", fit: 51,
    impossibleDates: true, // DQ: accepted before request sent (import mapping error)
    added: 26,
    history: [],
    notes: "Dates look wrong after import — check mapping before outreach.",
  },
];

// ---------------------------------------------------------------------------
// Seed execution
// ---------------------------------------------------------------------------

async function main() {
  console.log("Seeding…");

  await db.activity.deleteMany();
  await db.prospect.deleteMany();
  await db.campaign.deleteMany();
  await db.company.deleteMany();
  await db.savedView.deleteMany();
  await db.setting.deleteMany();
  await db.user.deleteMany();

  await db.user.create({
    data: {
      email: "operator@outreach.local",
      name: "Operator",
      passwordHash: hashPassword("outreach-2024"),
    },
  });

  const companyIds = new Map<string, string>();
  for (const c of companies) {
    const created = await db.company.create({
      data: {
        name: c.name,
        normalizedName: c.name
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, "")
          .replace(/\s+/g, " ")
          .trim(),
        website: c.website,
        linkedinUrl: c.linkedin,
        industry: c.industry,
        location: c.location,
        companySize: c.size,
        source: c.source,
        status: "Active",
      },
    });
    companyIds.set(c.key, created.id);
  }

  const campaignIds = new Map<string, string>();
  for (const c of campaigns) {
    const created = await db.campaign.create({
      data: {
        name: c.name,
        description: c.description,
        targetAudience: c.audience,
        status: c.status,
        startDate: daysAgo(c.started),
      },
    });
    campaignIds.set(c.key, created.id);
  }

  let activitiesCreated = 0;
  for (const p of prospects) {
    const history = (p.history ?? []).slice().sort((a, b) => b[1] - a[1]); // oldest first
    const requestDate = history.find((h) => h[0] === "Connection Request")?.[1];
    const acceptedRaw = history.find((h) => h[0] === "Connection Accepted")?.[1];
    const firstMessage = history.find((h) => h[0] === "Message Sent")?.[1];
    const lastContact = history.length
      ? Math.min(...history.map((h) => h[1]))
      : null;
    const followUpCount = history.filter((h) => h[0] === "Follow-Up Sent").length;

    // DQ scenario overrides
    let connectionRequestDate = p.skipRequestDate ? null : requestDate != null ? daysAgo(requestDate) : null;
    let connectionAcceptedDate = p.skipAcceptedDate ? null : acceptedRaw != null ? daysAgo(acceptedRaw) : null;
    if (p.impossibleDates) {
      // Accepted 6 days BEFORE the request was sent — impossible order.
      connectionRequestDate = daysAgo(4);
      connectionAcceptedDate = daysAgo(10);
    }

    const created = await db.prospect.create({
      data: {
        firstName: p.first,
        lastName: p.last ?? null,
        jobTitle: p.title ?? null,
        companyId: p.company ? companyIds.get(p.company) : null,
        linkedinUrl: p.linkedin ?? null,
        email: p.email ?? null,
        location: p.location ?? null,
        source: p.source ?? null,
        campaignId: p.campaign ? campaignIds.get(p.campaign) : null,
        status: p.status,
        priority: p.priority ?? "Medium",
        fitScore: p.fit ?? null,
        researchNotes: p.research ?? null,
        outreachAngle: p.angle ?? null,
        notes: p.notes ?? null,
        dateAdded: daysAgo(p.added, 9),
        connectionRequestDate,
        connectionAcceptedDate,
        firstMessageDate: firstMessage != null ? daysAgo(firstMessage) : null,
        lastContactDate: lastContact != null ? daysAgo(lastContact) : null,
        nextFollowUpDate: p.fq != null ? inDays(p.fq) : null,
        followUpCount,
        archivedAt: p.archivedDaysAgo != null ? daysAgo(p.archivedDaysAgo) : null,
      },
    });

    for (const [type, d, note, message] of history) {
      await db.activity.create({
        data: {
          prospectId: created.id,
          companyId: p.company ? companyIds.get(p.company) : null,
          campaignId: p.campaign ? campaignIds.get(p.campaign) : null,
          activityType: type,
          occurredAt: daysAgo(d, 11),
          notes: note ?? null,
          messageText: message ?? null,
          autoGenerated: false,
        },
      });
      activitiesCreated++;
    }
  }

  await db.setting.createMany({
    data: [
      { key: "defaultFollowUpDays", value: "3" },
      { key: "weeklyConnectionTarget", value: "40" },
      { key: "operatorName", value: "" },
      { key: "linkedinChecklistUrl", value: "" },
    ],
  });

  await db.savedView.createMany({
    data: [
      {
        name: "High priority — outreach active",
        entityType: "prospect",
        filtersJson: JSON.stringify({
          priority: "High",
          status: "Request Sent,Connected,Messaged,Follow-Up,Replied,Meeting",
        }),
      },
      {
        name: "Overdue follow-ups",
        entityType: "prospect",
        filtersJson: JSON.stringify({ hasFollowUp: "overdue" }),
      },
      {
        name: "Needs verification",
        entityType: "prospect",
        filtersJson: JSON.stringify({ status: "Needs Verification" }),
      },
    ],
  });

  const counts = await db.prospect.count();
  console.log(
    `Seeded: ${counts} prospects, ${companies.length} companies, ${campaigns.length} campaigns, ${activitiesCreated} activities.`,
  );
  console.log("Login: operator@outreach.local / outreach-2024");
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
