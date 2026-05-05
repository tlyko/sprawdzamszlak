// Cloudflare Worker entry — proxies /api/* to the AWS HTTP API,
// delegates everything else to the static-asset binding (Next.js export).
//
// Types come from tsconfig.worker.json (`@cloudflare/workers-types`).
//
// Architecture (ADR-008 PR 5b — restructure):
//
//   Browser
//     └─ sprawdzamszlak.pl/...
//          └─ Cloudflare edge
//               ├─ /api/admin/*  ┐ Cloudflare Access gates these paths,
//               ├─ /plany/admin/*┘ rejects unauthenticated traffic before
//               │                  it reaches this Worker. Authenticated
//               │                  requests carry Cf-Access-Jwt-Assertion.
//               │
//               └─ Worker.fetch()
//                    ├─ /api/* → fetch() upstream API GW (legacy execute-api URL)
//                    └─ else   → env.ASSETS.fetch(req) → Next static export
//
// Why this exists rather than a separate api.sprawdzamszlak.pl subdomain:
//   - Same-origin auth — cookies live on sprawdzamszlak.pl and the
//     frontend can call /api/* with no cross-origin friction.
//   - One CF Access app instead of two (no parent-domain cookie hack
//     needed; that field is hidden on Free anyway).
//   - The api.sprawdzamszlak.pl custom domain in Terraform is removed
//     in this PR alongside this Worker.

const API_GW_BASE = 'https://akoz890bg6.execute-api.eu-west-1.amazonaws.com/prod';

interface Env {
  ASSETS: Fetcher;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      // Strip the /api prefix and forward to API GW. Trailing slash on /api
      // maps to GW root (/) so `GET /api/` hits `GET /` (peaks list).
      const upstreamPath = url.pathname === '/api' ? '/' : url.pathname.slice(4);
      const upstream = `${API_GW_BASE}${upstreamPath}${url.search}`;

      // Pass through method, headers, body. The Request constructor
      // copies all of these from req when given a Request as second arg.
      // CF strips Host before fetch() — API GW sees its own host.
      // Cf-Access-Jwt-Assertion (injected by Access on /api/admin/*)
      // rides along in headers; Lambda's requireAdmin reads it.
      const proxied = new Request(upstream, req);
      return fetch(proxied);
    }

    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
