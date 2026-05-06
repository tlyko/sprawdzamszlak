/*
 * Polish-aware case + accent fold for fuzzy peak-name matching. The site's
 * peak roster is mixed: some names carry diacritics ("Łomnica", "Różanki"),
 * the user often types the bare-letter form ("lomnica", "rozanki"). This
 * fold makes the comparison succeed either way.
 *
 * NFD decomposes most accented Polish letters into base + combining mark
 * (ó → o + ◌́); stripping the combining-marks range (U+0300..U+036F) leaves
 * the bare base letter. The exception is ł — it does NOT decompose, so it
 * gets an explicit pass.
 *
 * Pure function, intentionally exported on its own module so peak-search
 * tests can poke at the fold logic without rendering React.
 */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .toLowerCase();
}
