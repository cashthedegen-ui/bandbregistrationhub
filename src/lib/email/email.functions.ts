import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { testEmailTemplate } from "./templates";

export const sendTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { to: string }) => {
    const to = (data?.to ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      throw new Error("Please enter a valid email address.");
    }
    return { to };
  })
  .handler(async ({ data }) => {
    const { sendEmail } = await import("./service.server");
    const tpl = testEmailTemplate(data.to);
    const result = await sendEmail({
      to: data.to,
      subject: tpl.subject,
      html: tpl.html,
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
    return { id: result.id, to: data.to };
  });
