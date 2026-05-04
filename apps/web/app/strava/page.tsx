/*
 * /strava — Strava OAuth entry page (ADR-007).
 *
 * Public, static. Single-user flow: clicking the button hands off to the
 * API Gateway endpoint which mints a CSRF state token and 302s to Strava.
 *
 * PR 5 restyle: the original implementation (PR #23) shipped before the
 * design system landed and inlined system-ui + arbitrary hex. This file now
 * uses the chrome tokens from globals.css. The brand orange on the CTA is
 * the only sanctioned non-token colour and lives in `.strava-cta` so it's
 * not sprayed across components.
 */
import type { Metadata } from "next";

const API_BASE = "https://akoz890bg6.execute-api.eu-west-1.amazonaws.com/prod";

export const metadata: Metadata = {
  title: "połącz ze stravą",
  description:
    "Połącz konto Strava ze sprawdzamszlak.pl, żeby nowe aktywności górskie pojawiały się automatycznie na mapie.",
};

export default function StravaConnectPage() {
  return (
    <main
      className="mx-auto w-full max-w-[560px] flex-1 px-5 py-12"
      style={{ minHeight: "calc(100vh - var(--header-h) - var(--footer-h))" }}
    >
      <header className="mb-6 flex flex-col gap-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">
          integracja
        </p>
        <h1 className="font-serif text-[28px] leading-tight text-ink-1">
          Połącz ze Stravą
        </h1>
      </header>

      <div className="mb-8 flex flex-col gap-4 font-sans text-[15px] leading-relaxed text-ink-2">
        <p>
          Po połączeniu nowe aktywności wpisane na Stravie pojawią się
          automatycznie na mapie sprawdzamszlak.pl. Importowane są tylko
          aktywności górskie (hike, walk, climbing, ski touring); jazda po
          mieście, bieg czy siłownia są pomijane.
        </p>
        <p className="text-[13px] text-ink-3">
          Aplikacja prosi o uprawnienia do odczytu Twoich aktywności
          (również prywatnych). Tokeny trafiają wprost do AWS Parameter
          Store i nigdy nie przechodzą przez przeglądarkę.
        </p>
      </div>

      <a href={`${API_BASE}/strava/oauth/start`} className="strava-cta">
        Połącz ze Stravą
      </a>
    </main>
  );
}
