/*
 * Type pill — small monospace chip that names the trail type ("oficjalny",
 * "pozaszlak", …). Reused by trip rows in the list and (later) the trip
 * detail panel header.
 *
 * Colour is keyed on `trail.type` so the pill matches the polyline colour
 * on the map (alpine-sky for official, rusalka for off-piste). The token
 * names mirror those in components/map/trail-style.ts deliberately — same
 * source of truth.
 */
import type { TrailType } from "@/components/map/types";

interface TypePillProps {
  type: TrailType;
}

// Polish labels + token-driven colour. Kept as a const map (not a switch) so
// extending it for new TrailType variants is a one-line patch.
const PILL_CONFIG: Record<
  TrailType,
  { label: string; colorClass: string; borderClass: string }
> = {
  official: {
    label: "oficjalny",
    colorClass: "text-alpine-sky",
    borderClass: "border-alpine-sky/40",
  },
  "off-piste": {
    label: "pozaszlak",
    colorClass: "text-rusalka",
    borderClass: "border-rusalka/40",
  },
};

export function TypePill({ type }: TypePillProps) {
  const config = PILL_CONFIG[type];
  return (
    <span
      className={`inline-flex items-center rounded-[3px] border px-1.5 py-[1px] font-mono text-[10px] uppercase tracking-[0.06em] leading-none ${config.colorClass} ${config.borderClass}`}
    >
      {config.label}
    </span>
  );
}
