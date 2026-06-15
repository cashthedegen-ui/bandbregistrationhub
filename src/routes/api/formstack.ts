import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export const Route = createFileRoute("/api/formstack")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const target = u.searchParams.get("url");
        if (!target) {
          return new Response(JSON.stringify({ error: "Missing url parameter" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
        const auth = request.headers.get("authorization") || "";
        const token = auth.replace(/^Bearer\s+/i, "").trim();
        try {
          const r = await fetch(decodeURIComponent(target), {
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
        } catch (e: any) {
          return new Response(JSON.stringify({ error: e?.message || "Proxy error" }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...CORS },
          });
        }
      },
    },
  },
});
