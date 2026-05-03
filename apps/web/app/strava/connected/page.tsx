// Strava OAuth callback landing page (ADR-007).
//
// API redirects here after the token exchange with ?status=ok|error&reason=...
// Reads from the URL via window.location to stay compatible with `output: 'export'`
// (no useSearchParams server side, since there's no server).

"use client";

import { useEffect, useState } from "react";

const REASON_MESSAGES: Record<string, string> = {
  missing_params: "Strava nie zwróciła wymaganych parametrów.",
  invalid_state: "Token zabezpieczający wygasł lub został już użyty. Spróbuj ponownie.",
  expired_state: "Token zabezpieczający wygasł (ponad 10 min). Spróbuj ponownie.",
  token_exchange_failed: "Strava odrzuciła wymianę kodu na token.",
  invalid_token_response: "Otrzymano nieprawidłową odpowiedź z API Stravy.",
};

function reasonText(reason: string | null): string {
  if (!reason) return "Nieznany błąd.";
  if (reason.startsWith("strava_")) return `Błąd po stronie Stravy: ${reason.slice(7)}.`;
  return REASON_MESSAGES[reason] ?? `Błąd: ${reason}.`;
}

export default function StravaConnectedPage() {
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("status");
    if (s === "ok") {
      setStatus("ok");
      setMessage("Konto Strava połączone. Nowe aktywności pojawią się na mapie automatycznie.");
    } else {
      setStatus("error");
      setMessage(reasonText(params.get("reason")));
    }
  }, []);

  const color = status === "ok" ? "#0a7d20" : status === "error" ? "#b00020" : "#555";

  return (
    <main
      style={{
        maxWidth: 560,
        margin: "0 auto",
        padding: "4rem 1.5rem",
        fontFamily: "system-ui, sans-serif",
        lineHeight: 1.6,
      }}
    >
      <h1 style={{ fontSize: "1.75rem", marginBottom: "1rem", color }}>
        {status === "ok" ? "Połączono" : status === "error" ? "Nie udało się połączyć" : "..."}
      </h1>
      <p style={{ marginBottom: "2rem" }}>{message}</p>
      {status === "error" ? (
        <a href="/strava" style={{ color: "#fc4c02", fontWeight: 600 }}>
          Spróbuj ponownie
        </a>
      ) : (
        <a href="/" style={{ color: "#0070f3", fontWeight: 600 }}>
          Wróć do mapy
        </a>
      )}
    </main>
  );
}
