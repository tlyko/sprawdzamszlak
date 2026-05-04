/*
 * Trail-name → peak match. Used by the logbook list to show summit altitudes
 * next to trail rows when the trail's name matches a peak in the seed.
 *
 * The match is alias-aware (the peak names in the seed look like
 * "Wysoka (Vysoká)", "Krywań (Kriváň)" — Polish + Slovak in parens) and
 * diacritic-insensitive (Strava activity names often drop diacritics, so
 * "Vysoka" should match "Vysoká"). Trails that don't correspond to a
 * single summit (e.g. "Dolina 5 stawów - zimą") just fall through with no
 * match, which is the correct outcome — no height to show.
 */
import type { Peak, Trail } from "@/components/map/types";

function normalize(s: string): string {
  // Strip combining diacritics (Unicode block U+0300–U+036F) so "Vysoká"
  // matches "Vysoka" — Strava activity names lose Slovak/Polish accents
  // when typed without a diacritic-aware keyboard.
  return s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").trim();
}

// Aliases for a single peak: the Polish name, the Slovak name in parens, and
// any whitespace-trimmed/normalised variants. Empty strings are dropped.
function buildAliases(peak: Peak): string[] {
  const out = new Set<string>();
  // "Polish (Slovak)" → ["Polish", "Slovak"]; "Polish" alone → ["Polish"].
  const match = /^([^(]+?)\s*(?:\(([^)]+)\))?\s*$/.exec(peak.nazwa);
  const polish = match?.[1]?.trim();
  const slovak = match?.[2]?.trim();
  if (polish) out.add(normalize(polish));
  if (slovak) out.add(normalize(slovak));
  // Defensive: include the full string verbatim too, in case the regex
  // missed an oddly-shaped name.
  out.add(normalize(peak.nazwa));
  return Array.from(out).filter((s) => s.length > 0);
}

/**
 * Find the peak whose nazwa (or its Slovak alias) equals the trail's name.
 * Returns null when no peak matches — caller renders the row without a
 * height. Preference: exact-equality match first; substring fallback for
 * "Krywań — droga …" style suffixed names is intentionally NOT done because
 * it would over-match on ambiguous trails.
 */
export function findPeakByTrailName(
  trail: Trail,
  peaks: Peak[]
): Peak | null {
  const trailNorm = normalize(trail.name);
  if (!trailNorm) return null;
  for (const peak of peaks) {
    const aliases = buildAliases(peak);
    if (aliases.includes(trailNorm)) return peak;
  }
  return null;
}
