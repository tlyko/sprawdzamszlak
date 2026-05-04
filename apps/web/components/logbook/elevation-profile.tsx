/*
 * Elevation profile — sparkline-style SVG built by hand, no chart library.
 *
 * Why no library (per docs/design-proposal.md §5 motion / §9 out-of-scope):
 *   The shape we need is a single polyline with a soft area fill underneath.
 *   Recharts/visx ship 30–60KB gzipped for that. A bespoke SVG is ~80 lines
 *   and gives us pixel control over how the line meets the panel edges.
 *
 * Inputs: TripCoordinate[] from the LineString geometry. The third element
 * (altitude in metres) is optional per Strava's stream API — when missing we
 * render a placeholder dash. The X axis is "point index" rather than haversine
 * distance: at sparkline scale (~520px wide, no axis labels) the eye can't
 * tell the difference, and skipping the haversine calc keeps this component a
 * pure render with zero deps.
 *
 * The polyline itself uses `currentColor` so the calling card decides the
 * stroke colour via Tailwind text-* utilities — keeps the palette centralised
 * in globals.css.
 */
import type { TripCoordinate } from "@/components/map/types";

interface ElevationProfileProps {
  coordinates: TripCoordinate[];
  /** Container height in px. Defaults to the desktop spec from §7. */
  height?: number;
  /** ARIA label — useful when this is the only visualisation of the data. */
  ariaLabel?: string;
}

// Internal canvas size. The SVG is rendered with `viewBox` and stretched
// responsively; these values just set the coordinate space. Larger viewBox =
// smoother curves at large display sizes.
const VIEWBOX_W = 600;

export function ElevationProfile({
  coordinates,
  height = 140,
  ariaLabel = "Profil wysokości",
}: ElevationProfileProps) {
  const altitudes: number[] = coordinates
    .map((c) => (c.length === 3 ? c[2] : null))
    .filter((v): v is number => typeof v === "number");

  // No altitude data means either a manual-seed route or a Strava import that
  // pre-dated stream collection. Render the placeholder per the brief.
  if (altitudes.length < 2) {
    return (
      <div
        className="flex items-center justify-center border border-dashed border-hairline bg-surface-1 text-ink-3"
        style={{ height }}
        role="img"
        aria-label="Brak profilu wysokości"
      >
        <span className="font-mono text-xs">— brak danych wysokości</span>
      </div>
    );
  }

  const minAlt = Math.min(...altitudes);
  const maxAlt = Math.max(...altitudes);
  // Guard against a flat profile (constant altitude) — collapsing the range
  // to zero would divide by zero below. Clamp to 1m so the line draws across
  // the centre instead.
  const range = Math.max(maxAlt - minAlt, 1);

  // Inset the path slightly inside the viewBox so the stroke isn't clipped at
  // the top/bottom edges.
  const PAD_Y = 4;
  const innerH = height - PAD_Y * 2;
  const stepX = VIEWBOX_W / Math.max(altitudes.length - 1, 1);

  const points = altitudes.map((alt, i) => {
    const x = i * stepX;
    const y = PAD_Y + (1 - (alt - minAlt) / range) * innerH;
    return [x, y] as const;
  });

  // Stroke path — connect every point.
  const linePath = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");

  // Fill path — same line, then close back along the baseline. The baseline is
  // height (the very bottom of the viewBox) so the fill reaches the bottom
  // edge regardless of the lowest altitude in the trip.
  const last = points[points.length - 1];
  const first = points[0];
  if (!last || !first) {
    // Defensive — TS narrowing for the array index access. Cannot occur
    // because we already returned when altitudes.length < 2.
    return null;
  }
  const fillPath = `${linePath} L${last[0].toFixed(2)} ${height} L${first[0].toFixed(2)} ${height} Z`;

  return (
    <figure
      className="text-alpine-sky"
      role="img"
      aria-label={`${ariaLabel}: od ${Math.round(minAlt)} do ${Math.round(maxAlt)} m`}
    >
      <svg
        viewBox={`0 0 ${VIEWBOX_W} ${height}`}
        preserveAspectRatio="none"
        // `block` removes the inline-baseline gap; full width and explicit
        // height let the parent decide vertical rhythm.
        className="block w-full"
        style={{ height }}
        // Decorative — the role + aria-label on <figure> already convey it.
        aria-hidden="true"
      >
        <path d={fillPath} fill="currentColor" opacity={0.14} />
        <path
          d={linePath}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.25}
          strokeLinecap="round"
          strokeLinejoin="round"
          // Path stroke width is in viewBox units; with non-uniform scaling
          // (preserveAspectRatio="none") we want the stroke to keep its visual
          // weight — leaving as-is is fine at typical aspect ratios.
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {/* Min/max altitudes printed below — gives the sparkline its scale
          without resorting to axis ticks. */}
      <figcaption className="mt-1 flex justify-between font-mono text-[10px] text-ink-3 tabular-nums">
        <span>{Math.round(minAlt)} m</span>
        <span>{Math.round(maxAlt)} m</span>
      </figcaption>
    </figure>
  );
}
