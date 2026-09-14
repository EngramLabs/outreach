"use client";

// Top bar: current section, global search trigger, quick add, theme, account.
// No giant hero — this is a workbench header (spec §6, §42).

import { useAppStore, VIEW_LABELS } from "@/state/app-state";
import { MobileSidebar } from "./sidebar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "next-themes";
import { useMutation } from "@tanstack/react-query";
import { authApi } from "@/lib/api-client";
import {
  Search,
  Plus,
  Sun,
  Moon,
  UserRound,
  LogOut,
  ChevronDown,
} from "lucide-react";

export function Topbar({ userName }: { userName: string }) {
  const view = useAppStore((s) => s.view);
  const setCommandOpen = useAppStore((s) => s.setCommandOpen);
  const openProspectForm = useAppStore((s) => s.openProspectForm);
  const openCompanyForm = useAppStore((s) => s.openCompanyForm);
  const openCampaignForm = useAppStore((s) => s.openCampaignForm);
  const setView = useAppStore((s) => s.setView);
  const { theme, setTheme } = useTheme();

  const logout = useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => window.location.reload(),
  });

  const initials = userName
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur sm:px-4">
      <MobileSidebar />
      <h1 className="text-[15px] font-semibold tracking-tight text-foreground">
        {VIEW_LABELS[view]}
      </h1>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setCommandOpen(true)}
          className="hidden h-8 items-center gap-2 rounded-md border bg-card px-3 text-[12.5px] text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground sm:flex"
          aria-label="Search everything (Ctrl+K)"
        >
          <Search aria-hidden className="size-3.5" />
          <span>Search…</span>
          <kbd className="font-num ml-2 rounded-[3px] border bg-surface-subtle px-1 py-px text-[10px] text-muted-foreground">
            ⌘K
          </kbd>
        </button>
        <Button
          variant="ghost"
          size="sm"
          className="size-8 p-0 sm:hidden"
          onClick={() => setCommandOpen(true)}
          aria-label="Search"
        >
          <Search className="size-4" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="h-8 gap-1.5 pl-2 pr-1.5">
              <Plus aria-hidden className="size-3.5" />
              <span className="hidden text-[12.5px] sm:inline">Add</span>
              <ChevronDown aria-hidden className="size-3 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => openProspectForm(null)}>
              <Plus aria-hidden className="size-3.5" /> Prospect
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openCompanyForm(null)}>
              <Plus aria-hidden className="size-3.5" /> Company
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openCampaignForm(null)}>
              <Plus aria-hidden className="size-3.5" /> Campaign
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="sm"
          className="size-8 p-0"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        >
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Account menu"
              className="font-num flex size-7 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary hover:bg-primary/20"
            >
              {initials || "OP"}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="text-[12.5px]">
              <span className="flex items-center gap-2 font-normal text-muted-foreground">
                <UserRound aria-hidden className="size-3.5" />
                {userName}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setView("settings")}>
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
              variant="destructive"
            >
              <LogOut aria-hidden className="size-3.5" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
