/*
 * Single source of truth for the API base URL (audyt 2026-05-05 §3.3 #7
 * + ADR-008 PR 5b restructure).
 *
 * In production the frontend is served from sprawdzamszlak.pl and a
 * Cloudflare Worker (apps/web/worker/index.ts) proxies `/api/*` to the
 * AWS HTTP API. So same-origin `/api` is the right base — fetch calls
 * inherit the page origin and Cloudflare Access cookies attach
 * automatically without cross-origin gymnastics.
 *
 * In local dev (`pnpm -F sprawdzamszlak-frontend dev`) there's no Worker;
 * NEXT_PUBLIC_API_BASE_URL pointed at the legacy execute-api hostname
 * lets the Next dev server hit the prod API directly. Keep that escape
 * hatch — it's how owner debugs without Cloudflare in the loop.
 */
export const API_BASE: string =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api';
