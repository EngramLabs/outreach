"use client";

// Command palette (Ctrl/Cmd+K): navigation + quick actions + global search
// with grouped results (spec §24). Functional, not decorative.

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useAppStore, VIEW_LABELS, type ViewId } from "@/state/app-state";
import { qk, searchApi } from "@/lib/api-client";
import {
  LayoutDashboard,
  Users,
  Building2,
  Megaphone,
  ListTodo,
  Clock3,
  FlaskConical,
  BarChart3,
  ShieldCheck,
  Archive,
  Settings,
  Plus,
  Upload,
  UserPlus,
} from "lucide-react";

const NAV_ITEMS: { id: ViewId; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "dashboard", icon: LayoutDashboard },
  { id: "prospects", icon: Users },
  { id: "companies", icon: Building2 },
  { id: "campaigns", icon: Megaphone },
  { id: "activities", icon: ListTodo },
  { id: "followups", icon: Clock3 },
  { id: "research", icon: FlaskConical },
  { id: "analytics", icon: BarChart3 },
  { id: "data-quality", icon: ShieldCheck },
  { id: "archive", icon: Archive },
  { id: "settings", icon: Settings },
];

export function CommandMenu() {
  const commandOpen = useAppStore((s) => s.commandOpen);
  const setCommandOpen = useAppStore((s) => s.setCommandOpen);
  const setView = useAppStore((s) => s.setView);
  const openProspect = useAppStore((s) => s.openProspect);
  const openProspectForm = useAppStore((s) => s.openProspectForm);
  const openActivityForm = useAppStore((s) => s.openActivityForm);
  const setImportOpen = useAppStore((s) => s.setImportOpen);

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandOpen(!commandOpen);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [commandOpen, setCommandOpen]);

  const { data: results, isFetching } = useQuery({
    queryKey: qk.search(debounced),
    queryFn: () => searchApi.search(debounced),
    enabled: commandOpen && debounced.trim().length >= 2,
  });

  const hasResults =
    results &&
    (results.prospects.length > 0 ||
      results.companies.length > 0 ||
      results.campaigns.length > 0 ||
      results.activities.length > 0);

  return (
    <CommandDialog
      open={commandOpen}
      onOpenChange={(open) => {
        setCommandOpen(open);
        if (!open) {
          setQuery("");
          setDebounced("");
        }
      }}
      title="Command menu"
      description="Navigate, search records, or run quick actions."
    >
      <CommandInput
        placeholder="Search prospects, companies, campaigns — or jump to a section…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList className="scroll-slim">
        {debounced.trim().length >= 2 && !isFetching && !hasResults ? (
          <CommandEmpty>No matches for “{debounced}”.</CommandEmpty>
        ) : null}
        {debounced.trim().length < 2 ? (
          <CommandEmpty>Type at least two letters to search records.</CommandEmpty>
        ) : null}

        {results?.prospects.length ? (
          <CommandGroup heading="Prospects">
            {results.prospects.map((p) => (
              <CommandItem
                key={p.id}
                value={`prospect ${p.firstName} ${p.lastName ?? ""} ${p.companyName ?? ""}`}
                onSelect={() => {
                  setCommandOpen(false);
                  openProspect(p.id);
                }}
              >
                <UserPlus aria-hidden className="size-3.5 text-muted-foreground" />
                <span className="font-medium">
                  {p.firstName} {p.lastName ?? ""}
                </span>
                <span className="truncate text-muted-foreground">
                  {p.jobTitle ? ` · ${p.jobTitle}` : ""}
                  {p.companyName ? ` · ${p.companyName}` : ""}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {results?.companies.length ? (
          <CommandGroup heading="Companies">
            {results.companies.map((c) => (
              <CommandItem
                key={c.id}
                value={`company ${c.name} ${c.industry ?? ""}`}
                onSelect={() => {
                  setCommandOpen(false);
                  setView("companies");
                }}
              >
                <Building2 aria-hidden className="size-3.5 text-muted-foreground" />
                <span className="font-medium">{c.name}</span>
                <span className="truncate text-muted-foreground">
                  {c.industry ? ` · ${c.industry}` : ""} · {c.prospectCount} prospects
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {results?.campaigns.length ? (
          <CommandGroup heading="Campaigns">
            {results.campaigns.map((c) => (
              <CommandItem
                key={c.id}
                value={`campaign ${c.name}`}
                onSelect={() => {
                  setCommandOpen(false);
                  setView("campaigns");
                }}
              >
                <Megaphone aria-hidden className="size-3.5 text-muted-foreground" />
                <span className="font-medium">{c.name}</span>
                <span className="text-muted-foreground"> · {c.status}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {results?.activities.length ? (
          <CommandGroup heading="Activity notes">
            {results.activities.map((a) => (
              <CommandItem
                key={a.id}
                value={`activity ${a.notes ?? a.messageText ?? ""}`}
                onSelect={() => {
                  setCommandOpen(false);
                  openProspect(a.prospectId);
                }}
              >
                <ListTodo aria-hidden className="size-3.5 text-muted-foreground" />
                <span className="truncate">
                  <span className="text-muted-foreground">{a.prospectName} — </span>
                  {(a.notes ?? a.messageText ?? "").slice(0, 80)}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {hasResults ? <CommandSeparator /> : null}

        <CommandGroup heading="Go to">
          {NAV_ITEMS.map((item) => (
            <CommandItem
              key={item.id}
              value={`go to ${VIEW_LABELS[item.id]}`}
              onSelect={() => setView(item.id)}
            >
              <item.icon aria-hidden className="size-3.5 text-muted-foreground" />
              {VIEW_LABELS[item.id]}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Actions">
          <CommandItem
            value="add prospect create new"
            onSelect={() => openProspectForm(null)}
          >
            <Plus aria-hidden className="size-3.5 text-muted-foreground" />
            Add prospect
          </CommandItem>
          <CommandItem value="log activity record" onSelect={() => openActivityForm(null)}>
            <ListTodo aria-hidden className="size-3.5 text-muted-foreground" />
            Log activity
          </CommandItem>
          <CommandItem value="import csv prospects" onSelect={() => setImportOpen(true)}>
            <Upload aria-hidden className="size-3.5 text-muted-foreground" />
            Import prospects (CSV)
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
