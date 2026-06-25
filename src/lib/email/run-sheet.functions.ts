import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runSheetEmailTemplate } from "./templates";

export interface SendRunSheetInput {
  to: string;
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

export const sendRunSheetEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: SendRunSheetInput) => {
    const to = (data?.to ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error("Please enter a valid email address.");
    if (!data?.pdfBase64) throw new Error("Missing run sheet PDF.");
    if (!data?.filename) throw new Error("Missing filename.");
    return data;
  })
  .handler(async ({ data }) => {
    const { sendEmail } = await import("./service.server");
    const tpl = runSheetEmailTemplate({ ...data.meta, intro: data.intro });
    const result = await sendEmail({
      to: data.to,
      subject: tpl.subject,
      html: tpl.html,
      attachments: [{ filename: data.filename, content: data.pdfBase64 }],
    });
    if (!result.ok) throw new Error(result.error);
    return { id: result.id, to: data.to };
  });
