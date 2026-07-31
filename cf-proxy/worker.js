// Minimal reverse proxy: forwards API requests to the Vercel-hosted backend.
// Exists purely as a fallback path in case a visitor's network blocks *.vercel.app -
// Cloudflare's network reaches Vercel fine even when the visitor's own network can't.
const UPSTREAM = "https://ib-the-lifter.vercel.app";

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET,POST,OPTIONS",
          "access-control-allow-headers": "Content-Type, Authorization"
        }
      });
    }

    const url = new URL(request.url);
    const targetUrl = UPSTREAM + url.pathname + url.search;

    const headers = new Headers();
    const contentType = request.headers.get("content-type");
    const authorization = request.headers.get("authorization");
    if (contentType) headers.set("content-type", contentType);
    if (authorization) headers.set("authorization", authorization);

    const init = { method: request.method, headers: headers };
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = await request.text();
    }

    let resp;
    try {
      resp = await fetch(targetUrl, init);
    } catch (e) {
      return new Response(JSON.stringify({ error: "PROXY_UPSTREAM_UNREACHABLE" }), {
        status: 502,
        headers: { "content-type": "application/json", "access-control-allow-origin": "*" }
      });
    }

    const respBody = await resp.text();
    return new Response(respBody, {
      status: resp.status,
      headers: {
        "content-type": resp.headers.get("content-type") || "application/json",
        "access-control-allow-origin": "*"
      }
    });
  }
};
