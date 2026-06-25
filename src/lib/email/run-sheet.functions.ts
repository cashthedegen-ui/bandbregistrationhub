import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runSheetEmailTemplate } from "./templates";

export interface SendRunSheetInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  filename: string;
  pdfBase64: string;
  intro?: string;
  meta: {
    schoolName: string;
    routeName: string;
    date: string;
    session: string;
    driverName: string;
    busNumber: string;
    riderCount: number;
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanList = (v: unknown): string[] => {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : String(v).split(/[,;\s]+/);
  return arr.map((s) => String(s).trim()).filter(Boolean);
};

export const sendRunSheetEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: SendRunSheetInput) => {
    const to = cleanList(data?.to);
    const cc = cleanList(data?.cc);
    const bcc = cleanList(data?.bcc);
    if (to.length === 0) throw new Error("Add at least one recipient in the To field.");
    for (const e of [...to, ...cc, ...bcc]) {
      if (!EMAIL_RE.test(e)) throw new Error(`Invalid email address: ${e}`);
    }
    if (!data?.pdfBase64) throw new Error("Missing run sheet PDF.");
    if (!data?.filename) throw new Error("Missing filename.");
    return { ...data, to, cc, bcc };
  })
  .handler(async ({ data }) => {
    const { sendEmail } = await import("./service.server");
    const tpl = runSheetEmailTemplate({ ...data.meta, intro: data.intro });
    const result = await sendEmail({
      to: data.to,
      cc: data.cc,
      bcc: data.bcc,
      subject: tpl.subject,
      html: tpl.html,
      attachments: [{ filename: data.filename, content: data.pdfBase64 }],
    });
    if (!result.ok) throw new Error(result.error);
    return { id: result.id, to: data.to, cc: data.cc, bcc: data.bcc };
  });
