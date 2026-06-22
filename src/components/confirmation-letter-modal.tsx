import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import type { StudentRow } from "@/lib/types";
import { buildConfirmationLetter, downloadConfirmationLetter, emailConfirmationLetter } from "@/lib/confirmation-letter";
import { Download, Mail, Printer } from "lucide-react";
import { toast } from "sonner";

export function ConfirmationLetterModal({ row, onClose }: { row: StudentRow; onClose: () => void }) {
  const { settings } = useStore();
  const previewUrl = useMemo(() => {
    try {
      return buildConfirmationLetter(row, settings.receipt).output("datauristring");
    } catch {
      return "";
    }
  }, [row, settings.receipt]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl w-[95vw] h-[90vh] bg-card border-border flex flex-col p-0">
        <DialogHeader className="px-5 py-3 border-b border-border">
          <DialogTitle>Confirmation Letter — {row.studentName}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 grid grid-cols-1 md:grid-cols-[260px_1fr] min-h-0">
          <div className="p-4 border-r border-border space-y-2">
            <div className="text-xs text-muted-foreground mb-2">
              Sending to:<br />
              <span className="text-foreground">{row.parentEmail || "no email on file"}</span>
            </div>
            <Button size="sm" className="w-full bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => downloadConfirmationLetter(row, settings.receipt)}>
              <Download className="h-4 w-4 mr-2" /> Download PDF
            </Button>
            <Button size="sm" variant="secondary" className="w-full" onClick={() => {
              const w = window.open(previewUrl);
              w?.addEventListener("load", () => w.print());
            }}>
              <Printer className="h-4 w-4 mr-2" /> Print
            </Button>
            <Button
              size="sm"
              variant="secondary"
              className="w-full"
              disabled={!row.parentEmail}
              onClick={() => {
                emailConfirmationLetter(row, settings.receipt);
                toast.success("PDF downloaded — attach it in your email client");
              }}
            >
              <Mail className="h-4 w-4 mr-2" /> Email parent
            </Button>
          </div>
          <div className="bg-background min-h-0 overflow-hidden">
            {previewUrl && <iframe title="confirmation-preview" src={previewUrl} className="w-full h-full border-0" />}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
