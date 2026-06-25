import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { fetchForms } from "@/lib/formstack";
import { downloadFullBackup } from "@/lib/backup";
import { sendTestEmail } from "@/lib/email/email.functions";
import { toast } from "sonner";
import { Plus, Trash2, LogOut, ShieldCheck, FileClock, Download, Mail } from "lucide-react";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Settings — B & B Transit" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { settings, updateSettings, loadDemo } = useStore();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [local, setLocal] = useState(settings);
  const [testing, setTesting] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [testEmail, setTestEmail] = useState(user?.email ?? "");
  const [sendingEmail, setSendingEmail] = useState(false);
  const sendTest = useServerFn(sendTestEmail);

  const save = () => { updateSettings(local); toast.success("Settings saved"); };

  const sendTestEmailNow = async () => {
    setSendingEmail(true);
    try {
      const res = await sendTest({ data: { to: testEmail.trim() } });
      toast.success(`Test email sent to ${res.to}`);
    } catch (e: any) {
      toast.error(`Email failed: ${e?.message || e}`);
    } finally { setSendingEmail(false); }
  };

  const runBackup = async () => {
    setBackingUp(true);
    try {
      const { filename, size } = await downloadFullBackup();
      toast.success(`Downloaded ${filename} (${(size / 1024).toFixed(1)} KB)`);
    } catch (e: any) {
      toast.error(`Backup failed: ${e?.message || e}`);
    } finally { setBackingUp(false); }
  };

  const test = async () => {
    setTesting(true);
    try {
      const forms = await fetchForms();
      toast.success(`Connected — ${forms.length} forms visible`);
    } catch (e: any) {
      toast.error(`Failed: ${e?.message || e}`);
    } finally { setTesting(false); }
  };

  return (
    <>
      <PageHeader title="Settings" subtitle="API connection, form mapping, and receipt customization." actions={
        <>
          <Button variant="ghost" onClick={loadDemo}>Load demo data</Button>
          <Button onClick={save} className="bg-primary text-primary-foreground hover:bg-primary/90">Save</Button>
        </>
      } />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-5 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">API Connection</h2>
            <div className="flex items-start gap-3 rounded-md border border-border bg-background/50 p-3">
              <ShieldCheck className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div className="text-xs text-muted-foreground leading-relaxed">
                The Formstack API token is stored securely as a backend secret and is never stored in the browser or source code.
              </div>
            </div>
            <Button variant="secondary" onClick={test} disabled={testing}>
              {testing ? "Testing…" : "Test Connection"}
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Forms</h2>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setLocal({
                  ...local,
                  forms: [...local.forms, { id: `f-${Date.now()}`, label: "", formId: "" }],
                })}
              >
                <Plus className="h-4 w-4 mr-1" /> Add Form
              </Button>
            </div>

            {local.forms.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">
                No forms configured. Click "Add Form" to pull submissions from a Formstack form.
              </p>
            ) : (
              <div className="space-y-2">
                {local.forms.map((f, i) => (
                  <div key={f.id} className="grid grid-cols-[1fr_160px_auto] gap-2 items-center">
                    <Input
                      value={f.label}
                      placeholder="Label (e.g. Hopkins School Bus 26-27)"
                      onChange={(e) => {
                        const forms = [...local.forms];
                        forms[i] = { ...f, label: e.target.value };
                        setLocal({ ...local, forms });
                      }}
                      className="bg-background"
                    />
                    <Input
                      value={f.formId}
                      placeholder="Form ID"
                      onChange={(e) => {
                        const forms = [...local.forms];
                        forms[i] = { ...f, formId: e.target.value };
                        setLocal({ ...local, forms });
                      }}
                      className="bg-background"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setLocal({ ...local, forms: local.forms.filter((x) => x.id !== f.id) })}
                      aria-label="Remove form"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              All listed forms are pulled in parallel when you click Sync All Forms.
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border lg:col-span-2">
          <CardContent className="p-5 space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Receipt Customization</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Company name" v={local.receipt.companyName} on={(v) => setLocal({ ...local, receipt: { ...local.receipt, companyName: v } })} />
              <Field label="Address" v={local.receipt.companyAddress} on={(v) => setLocal({ ...local, receipt: { ...local.receipt, companyAddress: v } })} />
              <Field label="Phone" v={local.receipt.companyPhone} on={(v) => setLocal({ ...local, receipt: { ...local.receipt, companyPhone: v } })} />
              <Field label="Email" v={local.receipt.companyEmail} on={(v) => setLocal({ ...local, receipt: { ...local.receipt, companyEmail: v } })} />
              <Field label="School year" v={local.receipt.schoolYear} on={(v) => setLocal({ ...local, receipt: { ...local.receipt, schoolYear: v } })} />
              <Field label="Footer" v={local.receipt.footer} on={(v) => setLocal({ ...local, receipt: { ...local.receipt, footer: v } })} />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border lg:col-span-2">
          <CardContent className="p-5 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Data & Audit</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-md border border-border bg-background/50 p-4 flex items-start gap-3">
                <FileClock className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">Audit Log</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Every status change, payment update, manual edit, deletion, sync, and settings change — with timestamp and user.
                  </p>
                  <Link to="/audit"><Button size="sm" variant="secondary" className="mt-3">View audit log</Button></Link>
                </div>
              </div>
              <div className="rounded-md border border-border bg-background/50 p-4 flex items-start gap-3">
                <Download className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">Full Data Backup</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    One-click download of everything — students, payments, settings, forms config, and the full audit log — as a dated JSON file.
                  </p>
                  <Button size="sm" variant="secondary" className="mt-3" onClick={runBackup} disabled={backingUp}>
                    {backingUp ? "Preparing…" : "Download Full Backup"}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border lg:col-span-2">
          <CardContent className="p-5 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Email</h2>
            <div className="flex items-start gap-3 rounded-md border border-border bg-background/50 p-3">
              <Mail className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div className="text-xs text-muted-foreground leading-relaxed">
                Emails send from <span className="font-medium text-foreground">B&amp;B Transportation &lt;info@bandbtrans.com&gt;</span> via Resend. The API key is stored securely as a backend secret.
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end">
              <div>
                <Label className="text-xs">Send test email to</Label>
                <Input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="bg-background"
                />
              </div>
              <Button
                variant="secondary"
                onClick={sendTestEmailNow}
                disabled={sendingEmail || !testEmail.trim()}
              >
                {sendingEmail ? "Sending…" : "Send Test Email"}
              </Button>
            </div>
          </CardContent>
        </Card>


        <Card className="bg-card border-border lg:col-span-2">
          <CardContent className="p-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Account</h2>
              <p className="text-sm text-foreground mt-1">{user?.email}</p>
              <p className="text-xs text-muted-foreground">Signed in</p>
            </div>
            <Button
              variant="secondary"
              onClick={async () => {
                await signOut();
                toast.success("Signed out");
                navigate({ to: "/auth", replace: true });
              }}
            >
              <LogOut className="h-4 w-4 mr-2" /> Log out
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Field({ label, v, on }: { label: string; v: string; on: (s: string) => void }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input value={v} onChange={(e) => on(e.target.value)} className="bg-background" />
    </div>
  );
}
