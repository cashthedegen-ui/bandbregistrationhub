// Server-only Resend email service. Never import from client code.
// Reads RESEND_API_KEY (Lovable secret `resend_api_key`) at call time.

export const EMAIL_FROM = "B&B Transportation <info@bandbtrans.com>";

export type SendEmailInput = {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  attachments?: { filename: string; content: string }[];
};

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string; status?: number };

function getApiKey(): string | null {
  return (
    process.env.RESEND_API_KEY ||
    process.env.resend_api_key ||
    null
  );
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    const msg = "Resend API key is not configured (resend_api_key secret missing).";
    console.error("[email] " + msg);
    return { ok: false, error: msg };
  }

  const arr = (v?: string | string[]) =>
    v == null ? undefined : (Array.isArray(v) ? v : [v]).map((s) => s.trim()).filter(Boolean);

  const payload = {
    from: EMAIL_FROM,
    to: arr(input.to) ?? [],
    ...(arr(input.cc)?.length ? { cc: arr(input.cc) } : {}),
    ...(arr(input.bcc)?.length ? { bcc: arr(input.bcc) } : {}),
    subject: input.subject,
    html: input.html,
    ...(input.text ? { text: input.text } : {}),
    ...(input.replyTo ? { reply_to: input.replyTo } : {}),
    ...(input.attachments && input.attachments.length ? { attachments: input.attachments } : {}),
  };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const bodyText = await res.text();
    let body: any = null;
    try { body = bodyText ? JSON.parse(bodyText) : null; } catch { /* keep text */ }

    if (!res.ok) {
      const error = body?.message || body?.error || bodyText || `HTTP ${res.status}`;
      console.error("[email] Resend send failed", {
        status: res.status,
        to: payload.to,
        subject: payload.subject,
        error,
      });
      return { ok: false, error, status: res.status };
    }

    const id = body?.id ?? "unknown";
    console.log("[email] sent", { id, to: payload.to, subject: payload.subject });
    return { ok: true, id };
  } catch (e: any) {
    const error = e?.message || String(e);
    console.error("[email] Resend network error", {
      to: payload.to,
      subject: payload.subject,
      error,
    });
    return { ok: false, error };
  }
}
