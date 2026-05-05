/*
 * /plany — public planner: lista wszystkich planowanych wyjść.
 *
 * Read-only view onto the chronicle's intent layer (ADR-008): owner
 * marks peaks they want to do this season, status flips to 'done' when
 * the corresponding Strava activity comes in. Public on purpose — same
 * stance as `/`, `/statystyki`, `/korona-tatr`: this kronika is open.
 *
 * Static-export shape: server component returns metadata + the client
 * route component which actually fetches `/api/plans` + `/api/` and
 * renders the list.
 */
import type { Metadata } from "next";

import { PlanyListRoute } from "./plany-list-route";

export const metadata: Metadata = {
  title: "plany",
  description:
    "Planowane wyjścia tatrzańskie — co w głowie na ten sezon. Status flipuje na 'zaliczone' gdy Strava zarejestruje aktywność na danym szczycie.",
};

export default function PlanyPage() {
  return <PlanyListRoute />;
}
