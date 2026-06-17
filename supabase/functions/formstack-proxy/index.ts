// Formstack API proxy. Reads FORMSTACK_API_TOKEN from Supabase secrets
// (also tolerates lowercase formstack_api_token) and forwards the request
// to the Formstack API. The token is never exposed to the frontend.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const token =
    Deno.env.get("FORMSTACK_API_TOKEN") ||
    Deno.env.get("formstack_api_token") ||
    "";
  if (!token) {
    return new Response(
      JSON.stringify({ error: "FORMSTACK_API_TOKEN not configured" }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS } },
    );
  }

  const u = new URL(req.url);
  const target = u.searchParams.get("url");
  if (!target) {
    return new Response(JSON.stringify({ error: "Missing url parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  // Only allow Formstack hosts
  let decoded: URL;
  try {
    decoded = new URL(decodeURIComponent(target));
  } catch {
    return new Response(JSON.stringify({ error: "Invalid url" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }
  if (!/(^|\.)formstack\.com$/i.test(decoded.hostname)) {
    return new Response(JSON.stringify({ error: "Disallowed host" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  try {
    const r = await fetch(decoded.toString(), {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    const text = await r.text();
    return new Response(text, {
      status: r.status,
      headers: {
        "Content-Type": r.headers.get("content-type") || "application/json",
        ...CORS,
      },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error)?.message || "Proxy error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS } },
    );
  }
});
