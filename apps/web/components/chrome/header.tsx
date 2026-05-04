import Link from "next/link";

/*
 * One-line header — site name in serif on the left, three text links on the
 * right. No logo, no nav drawer, no announcement bar. The 56px height is
 * mirrored as --header-h in globals.css so the map can size itself relative
 * to the chrome (PR 1 keeps TatraMap.tsx untouched).
 *
 * /o-projekcie is intentionally not yet a route — that page lands in PR 5.
 * The link is here because the chrome inventory should be stable from PR 1
 * on; clicking it produces a 404 for now, which is acceptable for a single-
 * user site mid-build. Move to the proper page when PR 5 lands.
 */

type NavItem = {
  href: string;
  label: string;
  // External links open new tab; internal links use Next router prefetching.
  external?: boolean;
};

const NAV: ReadonlyArray<NavItem> = [
  { href: "/", label: "mapa" },
  { href: "/o-projekcie", label: "o projekcie" },
  { href: "/strava", label: "strava" },
];

export function Header() {
  return (
    <header
      className="border-b border-hairline bg-surface-1/95 backdrop-blur-sm sticky top-0 z-[1100]"
      style={{ height: "var(--header-h)" }}
    >
      <div className="mx-auto flex h-full max-w-[1400px] items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          // Mark as serif via the Fraunces variable wired in app/layout.tsx.
          className="font-serif text-[20px] tracking-tight text-ink-1 hover:text-accent transition-colors duration-200"
          aria-label="sprawdzamszlak.pl — strona główna"
        >
          sprawdzamszlak
        </Link>

        <nav aria-label="Główna nawigacja">
          <ul className="flex items-center gap-5 sm:gap-7 font-mono text-[13px] text-ink-2">
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
