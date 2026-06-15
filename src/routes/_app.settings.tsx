import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { fetchForms } from "@/lib/formstack";
import { toast } from "sonner";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Settings — B & B Transit" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { settings, updateSettings, loadDemo } = useStore();
  const [local, setLocal] = useState(settings);
  const [show, setShow] = useState(false);
  const [testing, setTesting] = useState(false);

  const save = () => { updateSettings(local); toast.success("Settings saved"); };

  const test = async () => {
    setTesting(true);
    try {
      const forms = await fetchForms(local.apiToken);
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
            <div>
              <Label className="text-xs">Formstack API Token</Label>
              <div className="relative">
                <Input
                  type={show ? "text" : "password"}
                  value={local.apiToken}
                  onChange={(e) => setLocal({ ...local, apiToken: e.target.value })}
                  className="bg-background pr-9"
                />
                <button onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
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
