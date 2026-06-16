import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({ meta: [{ title: "Sign in — B & B Transit" }] }),
  component: AuthPage,
});

function AuthPage() {
  const { user, loading, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/", replace: true });
  }, [loading, user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const fn = mode === "signin" ? signIn : signUp;
    const { error } = await fn(email.trim(), password);
    setBusy(false);
    if (error) {
      toast.error(error);
      return;
    }
    if (mode === "signup") {
      toast.success("Account created. Check your email if confirmation is required.");
    } else {
      toast.success("Welcome back");
      navigate({ to: "/", replace: true });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="rounded-2xl bg-primary/10 p-4 ring-1 ring-primary/30 mb-4">
            <Bus className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            B & B Transportation
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Staff sign in to continue
          </p>
        </div>

        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex rounded-md bg-muted p-1 mb-5">
              <button
                type="button"
                onClick={() => setMode("signin")}
                className={`flex-1 text-sm py-1.5 rounded ${mode === "signin" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => setMode("signup")}
                className={`flex-1 text-sm py-1.5 rounded ${mode === "signup" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
              >
                Sign up
              </button>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label className="text-xs">Email</Label>
                <Input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-background"
                />
              </div>
              <div>
                <Label className="text-xs">Password</Label>
                <Input
                  type="password"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-background"
                />
              </div>
              <Button
                type="submit"
                disabled={busy}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Authorized personnel only.
        </p>
      </div>
    </div>
  );
}
