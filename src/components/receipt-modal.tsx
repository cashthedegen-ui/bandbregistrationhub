import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStore } from "@/lib/store";
import type { StudentRow } from "@/lib/types";
import { buildReceipt, downloadAllReceipts, downloadReceipt } from "@/lib/receipt";
import { Download, Printer } from "lucide-react";

export function ReceiptModal({ rows, onClose, onDownloadAll }: { rows: StudentRow[]; onClose: () => void; onDownloadAll: () => void }) {
  const { settings, updateSettings } = useStore();
  const [local, setLocal] = useState(settings.receipt);
  const [idx, setIdx] = useState(0);
  const row = rows[idx];

  const save = () => updateSettings({ ...settings, receipt: local });

  const previewUrl = (() => {
    try {
      const doc = buildReceipt(row, local, `BBT-${row.id.slice(0, 8).toUpperCase()}`);
      return doc.output("datauristring");
    } catch {
      return "";
    }
  })();

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl w-[95vw] h-[90vh] bg-card border-border flex flex-col p-0">
        <DialogHeader className="px-5 py-3 border-b border-border">
          <DialogTitle>PDF Receipt — {row.studentName}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 grid grid-cols-1 md:grid-cols-[300px_1fr] min-h-0">
          <div className="p-4 border-r border-border overflow-y-auto space-y-3">
            <div>
              <Label className="text-xs">Company name</Label>
              <Input value={local.companyName} onChange={(e) => setLocal({ ...local, companyName: e.target.value })} className="bg-background" />
            </div>
            <div>
              <Label className="text-xs">Address</Label>
              <Input value={local.companyAddress} onChange={(e) => setLocal({ ...local, companyAddress: e.target.value })} className="bg-background" />
            </div>
            <div>
              <Label className="text-xs">Phone</Label>
              <Input value={local.companyPhone} onChange={(e) => setLocal({ ...local, companyPhone: e.target.value })} className="bg-background" />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input value={local.companyEmail} onChange={(e) => setLocal({ ...local, companyEmail: e.target.value })} className="bg-background" />
            </div>
            <div>
              <Label className="text-xs">School year</Label>
              <Input value={local.schoolYear} onChange={(e) => setLocal({ ...local, schoolYear: e.target.value })} className="bg-background" />
            </div>
            <div>
              <Label className="text-xs">Footer</Label>
              <Input value={local.footer} onChange={(e) => setLocal({ ...local, footer: e.target.value })} className="bg-background" />
            </div>
            <Button size="sm" variant="secondary" className="w-full" onClick={save}>Save settings</Button>

            {rows.length > 1 && (
              <div className="pt-2 border-t border-border">
                <div className="text-xs text-muted-foreground mb-2">Receipt {idx + 1} of {rows.length}</div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setIdx(Math.max(0, idx - 1))}>Prev</Button>
                  <Button size="sm" variant="secondary" onClick={() => setIdx(Math.min(rows.length - 1, idx + 1))}>Next</Button>
                </div>
              </div>
            )}

            <div className="pt-3 border-t border-border space-y-2">
              <Button size="sm" className="w-full bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => downloadReceipt(row, local)}>
                <Download className="h-4 w-4 mr-2" /> Download PDF
              </Button>
              <Button size="sm" variant="secondary" className="w-full" onClick={() => {
                const w = window.open(previewUrl);
                w?.addEventListener("load", () => w.print());
              }}>
                <Printer className="h-4 w-4 mr-2" /> Print
              </Button>
              {rows.length > 1 && (
                <>
                  <Button size="sm" variant="secondary" className="w-full" onClick={() => downloadAllReceipts(rows, local)}>
                    Download All ({rows.length})
                  </Button>
                  <Button size="sm" variant="secondary" className="w-full" onClick={onDownloadAll}>
                    Print All
                  </Button>
                </>
              )}
            </div>
          </div>
          <div className="bg-background min-h-0 overflow-hidden">
            {previewUrl && <iframe title="receipt-preview" src={previewUrl} className="w-full h-full border-0" />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
