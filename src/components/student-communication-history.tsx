import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listStudentCommunicationLogs,
  type CommunicationLogRow,
} from "@/lib/communications/communications.functions";
import { CommunicationStatusBadge } from "./communication-preview-modal";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function StudentCommunicationHistory({
  studentId,
  refreshToken,
}: {
  studentId: string;
  refreshToken?: number;
}) {
  const fetchLogs = useServerFn(listStudentCommunicationLogs);
  const [rows, setRows] = useState<CommunicationLogRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetchLogs({ data: { studentId } })
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [fetchLogs, studentId]);

  useEffect(() => {
    load();
  }, [load, refreshToken]);

  if (loading && !rows) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading communication history…
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="text-xs text-muted-foreground py-2">
        No communications have been sent to this family yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Communication History
        </div>
        <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={load}>
          <RefreshCw className="h-3 w-3 mr-1" /> Refresh
        </Button>
      </div>
      <div className="divide-y divide-border/50 rounded border border-border bg-background/40">
        {rows.map((r) => (
          <div key={r.id} className="p-2 text-xs space-y-1">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="font-medium">{r.template_name || r.communication_type}</div>
              <div className="flex items-center gap-2">
                <CommunicationStatusBadge status={r.status} />
                <span className="text-muted-foreground text-[10px]">
                  {new Date(r.initiated_at).toLocaleString()}
                </span>
              </div>
            </div>
            <div className="text-muted-foreground text-[11px]">
              To {r.recipient_email || "—"} · by {r.initiated_by_email || "—"}
            </div>
            {r.failure_reason && (
              <div className="text-red-300 text-[11px]">Failure: {r.failure_reason}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
