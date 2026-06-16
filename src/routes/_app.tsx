import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app")({
  ssr: false,
  component: AppGate,
});

function AppGate() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [loading, user, navigate]);

  if (loading || !user) return null;

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
