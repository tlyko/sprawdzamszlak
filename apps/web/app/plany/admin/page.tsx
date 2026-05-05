/*
 * /plany/admin — owner-only write UI for plans (ADR-008).
 *
 * Sits behind Cloudflare Access — by the time this page renders the
 * user has already passed the magic-link gate, and CF cookies attach
 * to /api/admin/* calls automatically (same origin via Worker proxy).
 *
 * UI shape: full peak roster as a checkbox grid. Click a peak to
 * create a plan for the current year (POST /admin/plans), uncheck to
 * delete (DELETE /admin/plans/{id}). Inline edit panel reveals on
 * click for month / route_idea / notes / status / strava_id.
 */
import type { Metadata } from "next";

import { PlanyAdminRoute } from "./plany-admin-route";

export const metadata: Metadata = {
  title: "plany — admin",
  description: "Owner-only.",
  robots: { index: false, follow: false },
};

export default function PlanyAdminPage() {
  return <PlanyAdminRoute />;
}
