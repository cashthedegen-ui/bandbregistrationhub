import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import {
  LayoutDashboard, Users, Route as RouteIcon, BarChart3, Archive, Settings as SettingsIcon, RefreshCw, Bus, CheckCircle2, AlertCircle,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/students", label: "Students", icon: Users },
  { to: "/routes", label: "Routes", icon: RouteIcon },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/archive", label: "Archive", icon: Archive },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { syncAll, syncing, syncProgress, lastSync, isDemo, settings } = useStore();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "r" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const el = document.activeElement as HTMLElement | null;
        if (el && /input|textarea|select/i.test(el.tagName)) return;
        e.preventDefault();
        syncAll();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [syncAll]);

  const connected = !!settings.apiToken && !isDemo;

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-sidebar">
        <div className="flex items-center gap-2 px-5 py-5">
          <Bus className="h-6 w-6 text-primary" />
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold tracking-wide">B & B TRANSIT</span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Registration Hub</span>
          </div>
        </div>
        <nav className="flex-1 px-3 py-2 space-y-1">
          {nav.map((n) => {
            const active = n.exact ? pathname === n.to : pathname.startsWith(n.to);
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-primary"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-5 py-4 text-[11px] text-muted-foreground border-t border-border">
          v1.0 • Internal Ops
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 backdrop-blur px-4 md:px-6">
          <div className="md:hidden flex items-center gap-2 mr-2">
            <Bus className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold">B & B</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
                connected
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : isDemo
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-destructive/30 bg-destructive/10 text-destructive",
              )}
            >
              {connected ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
              {connected ? "Connected" : isDemo ? "Demo mode" : "Not connected"}
            </span>
            {lastSync && (
              <span className="hidden sm:inline text-[11px] text-muted-foreground">
                Last sync {new Date(lastSync).toLocaleString()}
              </span>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {syncing && (
              <span className="text-[11px] text-muted-foreground">
                {syncProgress.label} {syncProgress.total ? `(${syncProgress.done}/${syncProgress.total})` : ""}
              </span>
            )}
            <Button size="sm" onClick={syncAll} disabled={syncing} className="bg-primary text-primary-foreground hover:bg-primary/90">
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", syncing && "animate-spin")} />
              Sync All Forms
            </Button>
          </div>
        </header>

        <main className="flex-1 px-4 md:px-8 py-6 md:py-8">{children}</main>

        <nav className="md:hidden sticky bottom-0 flex border-t border-border bg-sidebar">
          {nav.map((n) => {
            const active = n.exact ? pathname === n.to : pathname.startsWith(n.to);
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
