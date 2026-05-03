// Strava OAuth entry page (ADR-007).
//
// Public, static. Single-user flow: clicking the button hands off to the
// API Gateway endpoint which mints CSRF state and 302s to Strava.

const API_BASE = "https://akoz890bg6.execute-api.eu-west-1.amazonaws.com/prod";

export const metadata = {
  title: "Połącz ze Stravą — sprawdzamszlak.pl",
};

export default function StravaConnectPage() {
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
      <h1 style={{ fontSize: "1.75rem", marginBottom: "1rem" }}>Połącz ze Stravą</h1>
      <p style={{ marginBottom: "1.5rem" }}>
        Po połączeniu nowe aktywności wpisane na Stravie pojawią się
        automatycznie na mapie sprawdzamszlak.pl. Importowane są tylko
        aktywności górskie (hike, walk, climbing, ski touring); jazda po
        mieście, bieg czy siłownia są pomijane.
      </p>
      <p style={{ marginBottom: "2rem", color: "#555", fontSize: "0.9rem" }}>
        Aplikacja prosi o uprawnienia do odczytu Twoich aktywności (również
        prywatnych). Tokeny trafiają wprost do AWS Parameter Store i nigdy
        nie przechodzą przez przeglądarkę.
      </p>
      <a
        href={`${API_BASE}/strava/oauth/start`}
        style={{
          display: "inline-block",
          padding: "0.75rem 1.5rem",
          background: "#fc4c02",
          color: "#fff",
          textDecoration: "none",
          borderRadius: 6,
          fontWeight: 600,
        }}
      >
        Połącz ze Stravą
      </a>
    </main>
  );
}
