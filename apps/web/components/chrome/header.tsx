import Link from "next/link";

/*
 * Header — site name in serif, nav links in mono.
 *
 * Layout:
 *   - viewport ≥420px: single row (logo left, nav right). The 56px
 *     --header-h in globals.css is sized for this layout.
 *   - viewport <420px (small phones — SE, narrow Android): 2-row layout
 *     (logo top, nav row 2). --header-h bumps to 84px via a media query
 *     so the map and other --header-h-anchored slots resize correctly.
 *
 * Why 2-row instead of a hamburger: the nav has 5 short items that fit
 * fine on two rows, and a hamburger would force one extra tap to reach
 * any chrome destination on every small-phone visit. The 2-row layout
 * also keeps the chrome typography consistent across viewports.
 */

type NavItem = {
  href: string;
  label: string;
  // External links open new tab; internal links use Next router prefetching.
  external?: boolean;
};

const NAV: ReadonlyArray<NavItem> = [
  { href: "/", label: "mapa" },
  { href: "/plany/", label: "plany" },
  { href: "/korona-tatr", label: "WKT" },
  { href: "/o-projekcie", label: "o projekcie" },
  { href: "/strava", label: "strava" },
];

export function Header() {
  return (
    <header
      className="border-b border-hairline bg-surface-1/95 backdrop-blur-sm sticky top-0 z-[1100]"
      style={{ height: "var(--header-h)" }}
    >
      <div className="mx-auto flex h-full max-w-[1400px] flex-col items-start justify-center gap-1 px-4 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between min-[420px]:gap-0 sm:px-6">
        <Link
          href="/"
          // Mark as serif via the Fraunces variable wired in app/layout.tsx.
          className="font-serif text-[17px] sm:text-[20px] tracking-tight text-ink-1 hover:text-accent transition-colors duration-200 min-[420px]:mr-3"
          aria-label="sprawdzamszlak.pl — strona główna"
        >
          sprawdzamszlak
        </Link>

        <nav aria-label="Główna nawigacja">
          <ul className="flex items-center gap-3.5 sm:gap-7 font-mono text-[12px] sm:text-[13px] text-ink-2 whitespace-nowrap">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="hover:text-ink-1 transition-colors duration-200"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
