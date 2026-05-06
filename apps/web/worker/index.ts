// Cloudflare Worker entry — proxies /api/* to the AWS HTTP API,
// rewrites /trasy/<slug>/ + /szczyty/<slug>/ to per-route shells
// (URL bar untouched), delegates everything else to the static-asset
// binding (Next.js export).
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
//                    ├─ /trasy/<slug>/ + /szczyty/<slug>/ → ASSETS.fetch(_shells/<route>)
//                    └─ else   → env.ASSETS.fetch(req) → Next static export
//
// Why the SPA rewrite lives here, not in `_redirects`:
//   The previous fix (PR #60) used a `_redirects` rule with status 200
//   to internally rewrite /trasy/* and /szczyty/* to per-route shells.
//   That works on Cloudflare Pages but NOT on Workers Static Assets —
//   Workers serves the rule as a 307 Temporary Redirect, the slug ends
//   up in the URL bar as `/_shells/szczyty`, useParams() reads `szczyty`
//   instead of `rysy`, and every peak/trip detail page rendered
//   "Nie znalazłem...". `env.ASSETS.fetch(<shell-url>, req)` returns the
//   shell body with status 200 and leaves the visible URL untouched.

const API_GW_BASE = 'https://akoz890bg6.execute-api.eu-west-1.amazonaws.com/prod';
const API_PROXY_TIMEOUT_MS = 15_000;

// Source path prefix → canonical asset URL to fetch via env.ASSETS.
//
// Note: NO trailing `.html`. CF Workers Static Assets normalises `.html`
// URLs by issuing a 307 redirect to the no-extension form (so external
// `/_shells/szczyty.html` → 307 → `/_shells/szczyty`). If the Worker
// fetches the `.html` URL via env.ASSETS.fetch it gets that 307 back
// and forwards it to the browser — losing the slug. Fetching the
// no-extension URL returns the shell body as 200 directly.
//
// Postbuild script `apps/web/scripts/copy-spa-shells.mjs` puts the
// shells on disk as `/_shells/<route>.html`; both URLs serve the same
// file content per CF normalization, but only the no-extension form
// returns 200 from env.ASSETS.
const SHELL_REWRITES: Record<string, string> = {
  '/trasy/': '/_shells/trasy',
  '/szczyty/': '/_shells/szczyty',
};

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
      // AbortSignal.timeout caps a hung upstream at 15s — without it
      // a stuck handler burns Worker CPU time until the platform kill.
      const proxied = new Request(upstream, req);
      try {
        return await fetch(proxied, { signal: AbortSignal.timeout(API_PROXY_TIMEOUT_MS) });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'upstream error';
        return new Response(JSON.stringify({ error: 'bad_gateway', message }), {
          status: 502,
          headers: { 'content-type': 'application/json' },
        });
      }
    }

    // Direct visits to dynamic SPA routes: serve the per-route shell with
    // status 200 (URL bar untouched). The shell loads /_next/* bundles
    // by absolute paths and useParams() reads window.location.pathname,
    // so the slug stays visible to the client.
    for (const [prefix, shellPath] of Object.entries(SHELL_REWRITES)) {
      if (url.pathname.startsWith(prefix) && url.pathname !== prefix) {
        const shellUrl = new URL(shellPath, url.origin);
        return env.ASSETS.fetch(new Request(shellUrl.toString(), req));
      }
    }

    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
