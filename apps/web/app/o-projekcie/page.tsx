/*
 * /o-projekcie — short About page, no map.
 *
 * Per docs/design-proposal.md §4 this is ~200 words of plain prose. No marketing,
 * no hero, no illustrations. The page exists primarily so that the "o projekcie"
 * link added to the header in PR 1 finally resolves to something instead of 404.
 *
 * The content is owner-curated and stable enough to live in TSX rather than a
 * markdown loader — pulling in a markdown pipeline for one page would be the
 * exact "small surface" violation CLAUDE.md warns against.
 */
import type { Metadata } from "next";
import Link from "next/link";

const REPO_URL = "https://github.com/tlyko/sprawdzamszlak";

export const metadata: Metadata = {
  title: "o projekcie",
  description:
    "Skąd się wzięło sprawdzamszlak.pl, na czym to działa i czego ten projekt nie jest.",
};

export default function AboutPage() {
  return (
    <main
      className="mx-auto w-full max-w-[640px] flex-1 px-5 py-8"
      style={{ minHeight: "calc(100vh - var(--header-h) - var(--footer-h))" }}
    >
      <nav className="mb-6">
        <Link
          href="/"
          className="font-mono text-[12px] uppercase tracking-[0.06em] text-ink-3 hover:text-ink-1 transition-colors"
        >
          ← dziennik
        </Link>
      </nav>

      <header className="mb-8 flex flex-col gap-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">
          o projekcie
        </p>
        <h1 className="font-serif text-[34px] leading-tight text-ink-1">
          sprawdzamszlak.pl
        </h1>
      </header>

      <div className="flex flex-col gap-5 font-sans text-[15px] leading-relaxed text-ink-2">
        <p>
          To moja prywatna kronika tatrzańska. Aplikacja jednoosobowa — nie
          serwis społecznościowy, nie klon Stravy, nie planer wycieczek.
          Zbieram tu trasy, którymi chodzę po Tatrach: oficjalne szlaki,
          podejścia pozaszlakowe, taternictwo, sporadycznie skitour. Mapa to
          oś tej strony; lista po lewej to spis treści.
        </p>

        <p>
          Dane mają dwa źródła. Trasy z dawniejszych wyjść wgrywam ręcznie
          jako pliki GPX — siedzą w S3, a manifest w DynamoDB. Nowe
          aktywności przylatują przez webhook ze Stravy; importowane są tylko
          aktywności górskie (hike, walk, ski touring, climbing — bieg po
          mieście czy siłownia są pomijane). Listę szczytów (ok. 320, z OSM
          i Wikipedii) prowadzę osobno; te najważniejsze mają wpis
          z trudnością, oceną wspinaczkową i krótkim komentarzem.
        </p>

        <p>
          Stack: Next.js na Cloudflare Workers (statyczny export + Worker
          proxy do API), Lambda + DynamoDB + S3 na AWS, Terraform na całość.
          Kod jest otwarty —{" "}
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="text-ink-1 underline decoration-hairline underline-offset-[3px] transition-colors hover:decoration-accent"
          >
            github.com/tlyko/sprawdzamszlak
          </a>
          .
        </p>

        <p className="border-t border-hairline pt-5 text-[13px] text-ink-3">
          <strong className="font-semibold text-ink-2">Uwaga:</strong> ta
          strona nie zastępuje nawigacji w terenie. Trasy nie są weryfikowane
          przez TPN ani TANAP, czas i przebieg odzwierciedlają moje konkretne
          wyjścia, nie warunki obecne. Idziesz na własną odpowiedzialność —
          mapa, kompas, prognoza, ocena lawinowa, wszystko jak zawsze.
        </p>
      </div>
    </main>
  );
}
