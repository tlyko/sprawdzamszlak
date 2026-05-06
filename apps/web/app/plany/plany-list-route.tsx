"use client";

/*
 * /plany — public planner list.
 *
 * Fetches plans + peaks roster in parallel, joins client-side so each
 * card can show the peak name (server returns peak_slug only, since the
 * full peak roster is one call away on the same API). Grouped by
 * target_year DESC, then by status order (planned → done → skipped).
 *
 * Empty state, loading state, and error state all match the project
 * convention — single-line, monospace, ink-3 (proposal §9).
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import type { Plan } from "@sprawdzamszlak/shared";
import { API_BASE } from "@/lib/api-base";
import type { Peak } from "@/components/map/types";

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; plans: Plan[]; peaksById: Map<string, Peak> };

const MONTH_NAMES = [
  "styczeń",
  "luty",
  "marzec",
  "kwiecień",
  "maj",
  "czerwiec",
  "lipiec",
  "sierpień",
  "wrzesień",
  "październik",
  "listopad",
  "grudzień",
];

const STATUS_ORDER: Record<Plan["status"], number> = {
  planned: 0,
  done: 1,
  skipped: 2,
};

const STATUS_LABEL: Record<Plan["status"], string> = {
  planned: "planowany",
  done: "zaliczony",
  skipped: "pominięty",
};

export function PlanyListRoute() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [plansRes, peaksRes] = await Promise.all([
          fetch(`${API_BASE}/plans`),
          fetch(`${API_BASE}/`),
        ]);
        if (!plansRes.ok) throw new Error(`plans: HTTP ${plansRes.status}`);
        if (!peaksRes.ok) throw new Error(`peaks: HTTP ${peaksRes.status}`);
        const plans = (await plansRes.json()) as Plan[];
        const peaks = (await peaksRes.json()) as Peak[];
        const peaksById = new Map(peaks.map((p) => [p.id, p]));
        if (!cancelled) setState({ kind: "ready", plans, peaksById });
      } catch (err) {
        if (!cancelled) {
          setState({
            kind: "error",
            message: err instanceof Error ? err.message : "nieznany błąd",
          });
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => {
    if (state.kind !== "ready") return [];
    const byYear = new Map<number, Plan[]>();
    for (const plan of state.plans) {
      const list = byYear.get(plan.target_year) ?? [];
      list.push(plan);
      byYear.set(plan.target_year, list);
    }
    const years = Array.from(byYear.keys()).sort((a, b) => b - a);
    return years.map((year) => ({
      year,
      plans: byYear
        .get(year)!
        .slice()
        .sort((a, b) => {
          const statusDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
          if (statusDiff !== 0) return statusDiff;
          // Within same status: planned ascending by month, done descending.
          const aM = a.target_month ?? (a.status === "done" ? 0 : 13);
          const bM = b.target_month ?? (b.status === "done" ? 0 : 13);
          return a.status === "done" ? bM - aM : aM - bM;
        }),
    }));
  }, [state]);

  return (
    <main
      className="mx-auto w-full max-w-[960px] grow shrink-0 px-5 py-8"
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
          plany
        </p>
        <h1 className="font-serif text-[34px] leading-tight text-ink-1">
          {state.kind === "ready" ? (
            <>
              <span className="tabular-nums text-alt-summit">
                {state.plans.filter((p) => p.status === "planned").length}
              </span>
              <span className="text-ink-2"> planowanych</span>
            </>
          ) : (
            <span className="text-ink-3">…</span>
          )}
        </h1>
        <p className="font-sans text-[15px] leading-relaxed text-ink-2">
          Co w głowie na ten sezon — i co już za sobą. Status zaznacza się jako
          „zaliczony" automatycznie, gdy Strava zarejestruje aktywność na
          szczycie z planu.
        </p>
      </header>

      {state.kind === "loading" && (
        <p className="font-mono text-sm text-ink-3">Wczytuję plany…</p>
      )}

      {state.kind === "error" && (
        <p className="font-mono text-sm text-danger">Błąd: {state.message}</p>
      )}

      {state.kind === "ready" && grouped.length === 0 && (
        <p className="font-mono text-sm text-ink-3">
          Lista pusta. Nic jeszcze nie zaplanowane.
        </p>
      )}

      {state.kind === "ready" &&
        grouped.map(({ year, plans }) => (
          <section key={year} className="mb-10">
            <h2 className="mb-4 font-mono text-[12px] uppercase tracking-[0.08em] text-ink-3 tabular-nums">
              {year}
            </h2>
            <ul role="list" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => (
                <li key={plan.id}>
                  <PlanCard plan={plan} peak={state.peaksById.get(plan.peak_slug) ?? null} />
                </li>
              ))}
            </ul>
          </section>
        ))}
    </main>
  );
}

interface PlanCardProps {
  plan: Plan;
  peak: Peak | null;
}

function PlanCard({ plan, peak }: PlanCardProps) {
  const peakName = peak?.nazwa ?? plan.peak_slug;
  const monthLabel =
    plan.target_month !== undefined && plan.target_month >= 1 && plan.target_month <= 12
      ? MONTH_NAMES[plan.target_month - 1]
      : null;

  // Done plans linked to a Strava trail link to /trasy/strava-{id}/.
  const stravaHref =
    plan.status === "done" && plan.strava_id ? `/trasy/${plan.strava_id}/` : null;

  const wrapperClass =
    "flex h-full flex-col gap-2 rounded-sm border border-hairline bg-surface-1 px-5 py-5";
  const contents = (
    <article
      className={
        plan.status === "done"
          ? `${wrapperClass} hover:bg-surface-2 transition-colors`
          : wrapperClass
      }
      aria-label={`Plan: ${peakName}, ${STATUS_LABEL[plan.status]}`}
    >
      <header className="flex items-start justify-between gap-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">
          {monthLabel ?? "—"}
        </p>
        <StatusBadge status={plan.status} />
      </header>

      <h3 className="font-serif text-[20px] leading-tight text-ink-1">
        {peakName}
      </h3>

      {peak?.height !== undefined ? (
        <p className="font-mono text-[12px] tabular-nums text-ink-3">
          {peak.height} m
        </p>
      ) : null}

      {plan.route_idea ? (
        <p className="text-sm leading-relaxed text-ink-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
            droga{" "}
          </span>
          {plan.route_idea}
        </p>
      ) : null}

      {plan.notes ? (
        <p className="text-sm leading-relaxed text-ink-2">{plan.notes}</p>
      ) : null}
    </article>
  );

  return stravaHref ? (
    <Link
      href={stravaHref}
      className="block focus-visible:outline-2 focus-visible:outline-accent"
    >
      {contents}
    </Link>
  ) : (
    contents
  );
}

function StatusBadge({ status }: { status: Plan["status"] }) {
  const cls =
    status === "done"
      ? "text-alt-summit"
      : status === "skipped"
        ? "text-ink-3"
        : "text-ink-2";
  return (
    <span
      className={`font-mono text-[10px] uppercase tracking-[0.08em] ${cls}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
