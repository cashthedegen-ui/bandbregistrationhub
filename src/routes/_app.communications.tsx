import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, MailCheck } from "lucide-react";
import {
  listRecentCommunicationLogs,
  listCommunicationTemplates,
  type CommunicationLogRow,
  type TemplateRow,
} from "@/lib/communications/communications.functions";
import { CommunicationStatusBadge } from "@/components/communication-preview-modal";

export const Route = createFileRoute("/_app/communications")({
  head: () => ({ meta: [{ title: "Communications — B & B Transit" }] }),
  component: CommunicationsPage,
});

function CommunicationsPage() {
  const fetchLogs = useServerFn(listRecentCommunicationLogs);
  const fetchTemplates = useServerFn(listCommunicationTemplates);
  const [logs, setLogs] = useState<CommunicationLogRow[] | null>(null);
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([fetchLogs(), fetchTemplates()])
      .then(([l, t]) => {
        setLogs(l);
        setTemplates(t);
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Communications"
        subtitle="Send approved confirmation letters, payment reminders, and program notices. All sends are logged."
        actions={
          <Button size="sm" variant="secondary" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        }
      />

      <Card className="p-4 bg-card border-border">
        <div className="flex items-center gap-2 mb-3">
          <MailCheck className="h-4 w-4 text-emerald-400" />
          <div className="font-medium">Approved Templates</div>
        </div>
        {templates === null ? (
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </div>
        ) : templates.length === 0 ? (
          <div className="text-xs text-muted-foreground">No active templates yet.</div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <div key={t.id} className="rounded border border-border bg-background/50 p-3 text-xs">
                <div className="font-medium text-sm">{t.template_name}</div>
                <div className="text-muted-foreground mt-1">
                  {t.communication_type} · {t.school_or_program}
                  {t.form_id ? ` · form ${t.form_id}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 text-[11px] text-muted-foreground">
          To trigger a confirmation, open a matching student on the Students page and choose
          <span className="mx-1 font-medium">Send Confirmation</span> in the row actions. The full
          Communications workspace (filters, bulk send, template editor) is arriving next.
        </div>
      </Card>

      <Card className="p-4 bg-card border-border">
        <div className="font-medium mb-3">Recent Sends</div>
        {logs === null ? (
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </div>
        ) : logs.length === 0 ? (
          <div className="text-xs text-muted-foreground">No communications sent yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left py-2 pr-3">When</th>
                  <th className="text-left py-2 pr-3">Student</th>
                  <th className="text-left py-2 pr-3">Recipient</th>
                  <th className="text-left py-2 pr-3">Template</th>
                  <th className="text-left py-2 pr-3">Type</th>
                  <th className="text-left py-2 pr-3">Sent by</th>
                  <th className="text-left py-2 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((r) => (
                  <tr key={r.id} className="border-t border-border/50">
                    <td className="py-2 pr-3 text-muted-foreground">
                      {new Date(r.initiated_at).toLocaleString()}
                    </td>
                    <td className="py-2 pr-3">{r.student_name || "—"}</td>
                    <td className="py-2 pr-3">{r.recipient_email || "—"}</td>
                    <td className="py-2 pr-3">{r.template_name || "—"}</td>
                    <td className="py-2 pr-3">{r.communication_type}</td>
                    <td className="py-2 pr-3 text-muted-foreground">
                      {r.initiated_by_email || "—"}
                    </td>
                    <td className="py-2 pr-3">
                      <CommunicationStatusBadge status={r.status} />
                      {r.failure_reason && (
                        <div className="text-red-300 text-[10px] mt-1 max-w-[220px] truncate" title={r.failure_reason}>
                          {r.failure_reason}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
