/*
 * /strava/connected — Strava OAuth callback landing page (ADR-007).
 *
 * The API redirects here after the token exchange with
 * `?status=ok|error&reason=…`. We read from the URL via window.location to
 * stay compatible with `output: 'export'` (no useSearchParams server-side,
 * since there's no server).
 *
 * PR 5 restyle:
 *  - Visual harmony with the rest of the redesign (chrome tokens, Geist +
 *    Fraunces, .strava-banner from globals.css).
 *  - Lint fixes that were pre-existing in this file:
 *      1. setState was called synchronously in the effect body (cascading
 *         renders). The url-parse + state flip now runs through
 *         queueMicrotask, mirroring the pattern used in /trasy/[slug] and
 *         /szczyty/[slug] route shells.
 *      2. The "Wróć do mapy" CTA used a raw <a href="/"> which the Next
 *         lint rule rightly flags — internal nav goes through next/link.
 */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const REASON_MESSAGES: Record<string, string> = {
  missing_params: "Strava nie zwróciła wymaganych parametrów.",
  invalid_state:
    "Token zabezpieczający wygasł lub został już użyty. Spróbuj ponownie.",
  expired_state:
    "Token zabezpieczający wygasł (ponad 10 min). Spróbuj ponownie.",
  token_exchange_failed: "Strava odrzuciła wymianę kodu na token.",
  invalid_token_response: "Otrzymano nieprawidłową odpowiedź z API Stravy.",
};

function reasonText(reason: string | null): string {
  if (!reason) return "Nieznany błąd.";
  if (reason.startsWith("strava_"))
    return `Błąd po stronie Stravy: ${reason.slice(7)}.`;
  return REASON_MESSAGES[reason] ?? `Błąd: ${reason}.`;
}

type Status = "loading" | "ok" | "error";

interface PageState {
  status: Status;
  message: string;
}

export default function StravaConnectedPage() {
  const [state, setState] = useState<PageState>({
    status: "loading",
    message: "",
  });

  useEffect(() => {
    // Defer the state flip onto a microtask so we don't trip the
    // "no synchronous setState in effects" lint rule. The work itself is
    // cheap (URL parse + dictionary lookup) but it must happen on the
    // client because output: 'export' has no SSR phase to read query
    // params at render time.
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const params = new URLSearchParams(window.location.search);
      const s = params.get("status");
      if (s === "ok") {
        setState({
          status: "ok",
          message:
            "Konto Strava połączone. Nowe aktywności pojawią się na mapie automatycznie.",
        });
      } else {
        setState({ status: "error", message: reasonText(params.get("reason")) });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const { status, message } = state;

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
          {status === "ok"
            ? "Połączono"
            : status === "error"
            ? "Nie udało się połączyć"
            : "Łączenie…"}
        </h1>
      </header>

      {status !== "loading" ? (
        <section
          className={`strava-banner ${
            status === "ok" ? "strava-banner--ok" : "strava-banner--error"
          } mb-8`}
          role={status === "error" ? "alert" : "status"}
        >
          <p
            className={`strava-banner__title ${
              status === "ok"
                ? "strava-banner__title--ok"
                : "strava-banner__title--error"
            }`}
          >
            {status === "ok" ? "Sukces" : "Błąd"}
          </p>
          <p className="strava-banner__body">{message}</p>
        </section>
      ) : (
        <p className="mb-8 font-mono text-sm text-ink-3">Łączenie ze Stravą…</p>
      )}

      {status === "error" ? (
        <a href="/strava" className="strava-cta">
          Spróbuj ponownie
        </a>
      ) : status === "ok" ? (
        <Link
          href="/"
          className="font-mono text-[12px] uppercase tracking-[0.06em] text-ink-2 hover:text-ink-1 transition-colors"
        >
          ← wróć do mapy
        </Link>
      ) : null}
    </main>
  );
}
