/*
 * Trip detail panel — content shared by the desktop in-place expansion and
 * the mobile /trasy/[slug] page.
 *
 * Per docs/design-proposal.md §7 the panel sits inside the same scrolling list
 * column on desktop, replacing the row's compact header. On mobile it is the
 * whole page (the global map is hidden). To keep both call sites in sync we
 * render the same component in both places — the only thing that varies is
 * whether a Close button is rendered (desktop only; mobile uses browser back).
 *
 * Data shape:
 *   - `trail` is the manifest entry (id, name, type, geojson_url).
 *   - `meta` is the narrowed view of the per-trail GeoJSON Feature properties
 *     produced by `extract-trip-meta.ts`. May be null when the GeoJSON failed
 *     to load — in that case we render the name/type only and skip stats.
 *
 * No fetching here — the page above (logbook home or /trasy/[slug]) owns the
 * manifest + GeoJSON loading. This component is a pure render.
 */
import type { Trail } from "@/components/map/types";
import { TypePill } from "./type-pill";
import { ElevationProfile } from "./elevation-profile";
import type { TripMeta } from "./extract-trip-meta";

interface TripDetailPanelProps {
  trail: Trail;
  meta: TripMeta | null;
  /** Optional close handler — when provided, renders an X button. */
  onClose?: () => void;
  /** Heading level for the trip name. h2 inside the desktop list, h1 on the
   *  mobile route. */
  headingLevel?: 2 | 3;
}

const POLISH_WEEKDAYS = [
  "niedziela",
  "poniedziałek",
  "wtorek",
  "środa",
  "czwartek",
  "piątek",
  "sobota",
] as const;

const POLISH_MONTHS = [
  "stycznia",
  "lutego",
  "marca",
  "kwietnia",
  "maja",
  "czerwca",
  "lipca",
  "sierpnia",
  "września",
  "października",
  "listopada",
  "grudnia",
] as const;

function formatPolishDate(isoString: string): { date: string; weekday: string } | null {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return null;
  // Strava emits UTC; for a Polish hiking log local Polish-time is expected.
  // Browser default toLocale with the right month words and weekday is
  // possible but heavy on bundle size; cheaper to spell them out.
  const day = d.getDate();
  const month = POLISH_MONTHS[d.getMonth()];
  const year = d.getFullYear();
  const weekday = POLISH_WEEKDAYS[d.getDay()];
  if (!month || !weekday) return null;
  return { date: `${day} ${month} ${year}`, weekday };
}

function formatDistanceKm(meters: number): string {
  // 8430 m → "8,4 km" (Polish decimal comma).
  const km = meters / 1000;
  return `${km.toFixed(1).replace(".", ",")} km`;
}

function formatElevation(meters: number): string {
  // Round to 5 m — matches the precision of barometric altitude on Strava
  // streams and avoids implying a centimetre-perfect figure.
  const rounded = Math.round(meters / 5) * 5;
  return `+${rounded} m`;
}

// Polish labels for the Strava sport_type values our fetcher accepts.
// Keep this aligned with SPORT_TYPE_ALLOWLIST in apps/api/src/strava/fetcher.ts.
const SPORT_TYPE_LABEL: Record<string, string> = {
  Hike: "wędrówka",
  TrailRun: "bieg górski",
  Run: "bieg",
  Ride: "rower",
  AlpineSki: "narty zjazdowe",
  BackcountrySki: "skitour",
  RockClimbing: "wspinaczka",
  Snowshoe: "rakiety śnieżne",
};

export function TripDetailPanel({
  trail,
  meta,
  onClose,
  headingLevel = 2,
}: TripDetailPanelProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const properties = meta?.properties;
  const coordinates = meta?.coordinates ?? [];

  const dateFormatted = properties?.start_date
    ? formatPolishDate(properties.start_date)
    : null;

  const sportLabel = properties?.sport_type
    ? SPORT_TYPE_LABEL[properties.sport_type] ?? properties.sport_type.toLowerCase()
    : null;

  return (
    <article
      className="flex flex-col gap-5 px-5 py-5"
      aria-label={`Szczegóły trasy: ${trail.name}`}
    >
      {/* Date row + close. The close button only renders when a handler is
          provided; on the mobile route we omit it (the browser back button is
          the affordance). */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {dateFormatted ? (
            <p className="font-mono text-xs text-ink-3 tabular-nums">
              {dateFormatted.date}{" "}
              <span className="text-ink-3/70">· {dateFormatted.weekday}</span>
            </p>
          ) : (
            <p className="font-mono text-xs text-ink-3">brak daty</p>
          )}
          <Heading className="mt-1 font-serif text-[22px] leading-tight text-ink-1">
            {trail.name}
          </Heading>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Zamknij szczegóły trasy"
            className="-mr-1 -mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-ink-3 transition-colors hover:bg-surface-1 hover:text-ink-1"
          >
            {/* Inline SVG so we don't pull lucide-react for one icon. */}
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="M2 2 L12 12 M12 2 L2 12" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}
      </header>

      {/* Stats row. Only renders the metrics that the GeoJSON actually
          provided — manual seeds drop out gracefully without "—" placeholders
          that would imply broken data. */}
      {(properties?.distance !== undefined ||
        properties?.total_elevation_gain !== undefined) && (
        <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-2 font-mono text-sm text-ink-mono">
          {properties?.total_elevation_gain !== undefined && (
            <div className="flex items-baseline gap-1.5">
              <dt className="text-[11px] uppercase tracking-[0.08em] text-ink-3">
                podejście
              </dt>
              <dd className="tabular-nums text-ink-1">
                {formatElevation(properties.total_elevation_gain)}
              </dd>
            </div>
          )}
          {properties?.distance !== undefined && (
            <div className="flex items-baseline gap-1.5">
              <dt className="text-[11px] uppercase tracking-[0.08em] text-ink-3">
                dystans
              </dt>
              <dd className="tabular-nums text-ink-1">
                {formatDistanceKm(properties.distance)}
              </dd>
            </div>
          )}
        </dl>
      )}

      {/* Type pill row. sport_type from Strava is shown alongside the
          manifest's own type when available — they tell different stories
          (terrain class vs. activity). */}
      <div className="flex flex-wrap items-center gap-2">
        <TypePill type={trail.type} />
        {sportLabel ? (
          <span className="inline-flex items-center rounded-[3px] border border-hairline px-1.5 py-[1px] font-mono text-[10px] uppercase tracking-[0.06em] leading-none text-ink-2">
            {sportLabel}
          </span>
        ) : null}
      </div>

      {/* Elevation profile. The component itself handles the no-altitude
          fallback, so we hand it whatever coords we have. */}
      <ElevationProfile coordinates={coordinates} />

      {/* Notes — only present for Strava-imported routes that carried a
          description. Manual seeds skip this. */}
      {properties?.description ? (
        <p className="whitespace-pre-line font-sans text-sm leading-relaxed text-ink-2">
          {properties.description}
        </p>
      ) : null}

      {/* Action row. The "GPX" link points at the existing presigned GeoJSON
          URL for now — a real GPX endpoint can swap this href without touching
          the panel surface. The Strava deep-link is added when the import
          carried the activity id. */}
      <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-hairline pt-4 text-sm text-ink-2">
        <a
          href={trail.geojson_url}
          download
          className="font-mono text-[12px] uppercase tracking-[0.06em] hover:text-ink-1 transition-colors"
        >
          pobierz GPX
        </a>
        {properties?.strava_activity_id !== undefined ? (
          <a
            href={`https://www.strava.com/activities/${properties.strava_activity_id}`}
            target="_blank"
            rel="noreferrer noopener"
            className="font-mono text-[12px] uppercase tracking-[0.06em] hover:text-ink-1 transition-colors"
          >
            otwórz w Stravie ↗
          </a>
        ) : null}
      </footer>
    </article>
  );
}
