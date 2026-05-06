"use client";

/*
 * /plany/admin — owner-only planner.
 *
 * Layout (single column, max-width comfortable for reading):
 *   - Year selector (default = current year)
 *   - Search box
 *   - Tier groups (summit / high / mid / low) collapsing
 *   - Checkbox row per peak: toggle creates/deletes a plan for the
 *     current year. Checked peaks expand to inline edit (month, notes,
 *     route idea, status, strava_id).
 *
 * All write calls go to `/api/admin/plans*` with `credentials: 'include'`
 * so the CF Access cookie (set on sprawdzamszlak.pl) attaches. Errors
 * surface inline via `globalError`. Each row is treated as
 * pending-while-in-flight (peak id in `pendingPeaks`) and we refetch
 * the plans list on success — single-user latency tolerance > the
 * complexity of an optimistic-rollback path.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { API_BASE } from "@/lib/api-base";
import type { Peak } from "@/components/map/types";
import { classifyPeak, type PeakTier } from "@/components/map/peak-tier";

interface Plan {
  id: string;
  peak_slug: string;
  target_year: number;
  target_month?: number;
  status: "planned" | "done" | "skipped";
  route_idea?: string;
  notes?: string;
  strava_id?: string;
  created_at: number;
  updated_at: number;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; peaks: Peak[]; plans: Plan[] };

const TIER_ORDER: PeakTier[] = ["summit", "high", "mid", "low"];
const TIER_LABEL: Record<PeakTier, string> = {
  summit: "Korona",
  high: "Wysokie",
  mid: "Średnie",
  low: "Pozostałe",
};

const MONTHS = [
  { value: "", label: "—" },
  { value: "1", label: "styczeń" },
  { value: "2", label: "luty" },
  { value: "3", label: "marzec" },
  { value: "4", label: "kwiecień" },
  { value: "5", label: "maj" },
  { value: "6", label: "czerwiec" },
  { value: "7", label: "lipiec" },
  { value: "8", label: "sierpień" },
  { value: "9", label: "wrzesień" },
  { value: "10", label: "październik" },
  { value: "11", label: "listopad" },
  { value: "12", label: "grudzień" },
];

const STATUSES: Array<{ value: Plan["status"]; label: string }> = [
  { value: "planned", label: "planowany" },
  { value: "done", label: "zaliczony" },
  { value: "skipped", label: "pominięty" },
];

export function PlanyAdminRoute() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [year, setYear] = useState<number>(() => new Date().getFullYear());
  const [search, setSearch] = useState("");
  const [pendingPeaks, setPendingPeaks] = useState<Set<string>>(new Set());
  const [globalError, setGlobalError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Manual open/closed state per tier. Korona starts open, other tiers
  // start closed (320 peaks would otherwise be one giant scroll). When
  // a search is active we override and force every tier open so matches
  // are visible regardless of which group they fall into.
  const [openTiers, setOpenTiers] = useState<Set<PeakTier>>(
    () => new Set<PeakTier>(["summit"]),
  );

  // ⌘K / Ctrl+K focuses the search input. Skip when the user is already
  // typing in an editable field — they may have a global shortcut habit
  // but inside a textarea we don't want to steal the keystroke.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "k" && e.key !== "K") return;
      if (!(e.metaKey || e.ctrlKey)) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        // Already in an input — let ⌘K through to the browser's omnibox
        // handler if the user was deliberately invoking it from elsewhere.
        return;
      }
      e.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [peaksRes, plansRes] = await Promise.all([
        fetch(`${API_BASE}/`),
        fetch(`${API_BASE}/plans`),
      ]);
      if (!peaksRes.ok) throw new Error(`peaks: HTTP ${peaksRes.status}`);
      if (!plansRes.ok) throw new Error(`plans: HTTP ${plansRes.status}`);
      const peaks = (await peaksRes.json()) as Peak[];
      const plans = (await plansRes.json()) as Plan[];
      setState({ kind: "ready", peaks, plans });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : "nieznany błąd",
      });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const plansForYear = useMemo(() => {
    if (state.kind !== "ready") return new Map<string, Plan>();
    const out = new Map<string, Plan>();
    for (const plan of state.plans) {
      if (plan.target_year === year) out.set(plan.peak_slug, plan);
    }
    return out;
  }, [state, year]);

  const filteredPeaks = useMemo(() => {
    if (state.kind !== "ready") return [];
    const q = search.trim().toLowerCase();
    return state.peaks
      .filter((p) => {
        if (q.length === 0) return true;
        return p.nazwa.toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
      })
      .slice()
      .sort((a, b) => (b.height ?? 0) - (a.height ?? 0));
  }, [state, search]);

  const groupedByTier = useMemo(() => {
    const groups = new Map<PeakTier, Peak[]>();
    for (const tier of TIER_ORDER) groups.set(tier, []);
    for (const peak of filteredPeaks) {
      const tier = classifyPeak(peak.height);
      groups.get(tier)!.push(peak);
    }
    return groups;
  }, [filteredPeaks]);

  const handleToggle = useCallback(
    async (peak: Peak) => {
      if (state.kind !== "ready") return;
      const existing = plansForYear.get(peak.id);
      setPendingPeaks((prev) => new Set(prev).add(peak.id));
      setGlobalError(null);

      try {
        if (existing) {
          const res = await fetch(`${API_BASE}/admin/plans/${existing.id}`, {
            method: "DELETE",
            credentials: "include",
          });
          if (!res.ok && res.status !== 204) {
            throw new Error(`DELETE: HTTP ${res.status}`);
          }
        } else {
          const res = await fetch(`${API_BASE}/admin/plans`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ peak_slug: peak.id, target_year: year }),
          });
          if (!res.ok) {
            const body = await res.text().catch(() => "");
            throw new Error(`POST: HTTP ${res.status} ${body}`);
          }
        }
        await refresh();
      } catch (err) {
        setGlobalError(err instanceof Error ? err.message : String(err));
      } finally {
        setPendingPeaks((prev) => {
          const next = new Set(prev);
          next.delete(peak.id);
          return next;
        });
      }
    },
    [plansForYear, refresh, state, year],
  );

  const handlePatch = useCallback(
    async (planId: string, payload: Partial<Plan>) => {
      setGlobalError(null);
      try {
        const res = await fetch(`${API_BASE}/admin/plans/${planId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(`PATCH: HTTP ${res.status} ${body}`);
        }
        await refresh();
      } catch (err) {
        setGlobalError(err instanceof Error ? err.message : String(err));
      }
    },
    [refresh],
  );

  return (
    <main
      className="mx-auto w-full max-w-[960px] grow shrink-0 px-5 py-8"
      style={{ minHeight: "calc(100vh - var(--header-h) - var(--footer-h))" }}
    >
      <nav className="mb-6 flex items-center justify-between">
        <Link
          href="/plany/"
          className="font-mono text-[12px] uppercase tracking-[0.06em] text-ink-3 hover:text-ink-1 transition-colors"
        >
          ← plany
        </Link>
        <a
          href="https://sprawdzamszlak.cloudflareaccess.com/cdn-cgi/access/logout"
          className="font-mono text-[12px] uppercase tracking-[0.06em] text-ink-3 hover:text-ink-1 transition-colors"
        >
          wyloguj
        </a>
      </nav>

      <header className="mb-8 flex flex-col gap-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">
          plany — admin
        </p>
        <h1 className="font-serif text-[34px] leading-tight text-ink-1">
          {year} <span className="text-ink-3">— ticknij szczyt</span>
        </h1>

        <div className="flex flex-wrap items-center gap-4">
          <YearSelector year={year} onChange={setYear} />
          <input
            ref={searchInputRef}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="szukaj…  (⌘K)"
            className="flex-1 min-w-[200px] rounded-sm border border-hairline bg-surface-1 px-3 py-2 font-sans text-sm text-ink-1 placeholder-ink-3 focus:outline-none focus:border-accent"
            aria-label="szukaj szczytu"
          />
        </div>
      </header>

      {globalError && (
        <p className="mb-4 rounded-sm border border-danger bg-surface-1 px-3 py-2 font-mono text-sm text-danger">
          Błąd: {globalError}
        </p>
      )}

      {state.kind === "loading" && (
        <p className="font-mono text-sm text-ink-3">Wczytuję…</p>
      )}

      {state.kind === "error" && (
        <p className="font-mono text-sm text-danger">Błąd: {state.message}</p>
      )}

      {state.kind === "ready" &&
        TIER_ORDER.map((tier) => {
          const peaks = groupedByTier.get(tier) ?? [];
          if (peaks.length === 0) return null;
          // Search overrides any manual collapse so a hit in "Pozostałe"
          // is still visible without clicking through.
          const open = search.length > 0 || openTiers.has(tier);
          return (
            <details
              key={tier}
              className="mb-4 rounded-sm border border-hairline bg-surface-1"
              open={open}
              onToggle={(e) => {
                if (search.length > 0) return; // search dictates open
                const isOpen = (e.target as HTMLDetailsElement).open;
                setOpenTiers((prev) => {
                  const next = new Set(prev);
                  if (isOpen) next.add(tier);
                  else next.delete(tier);
                  return next;
                });
              }}
            >
              <summary className="cursor-pointer list-none px-4 py-3 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3 marker:hidden hover:text-ink-1 transition-colors">
                <span aria-hidden="true" className="mr-2 inline-block w-2 text-ink-3">
                  {open ? "▾" : "▸"}
                </span>
                {TIER_LABEL[tier]}{" "}
                <span className="text-ink-2">({peaks.length})</span>
              </summary>
              <ul
                role="list"
                className="flex flex-col divide-y divide-hairline border-t border-hairline"
              >
                {peaks.map((peak) => (
                  <li key={peak.id}>
                    <PeakRow
                      peak={peak}
                      plan={plansForYear.get(peak.id) ?? null}
                      pending={pendingPeaks.has(peak.id)}
                      onToggle={() => handleToggle(peak)}
                      onPatch={handlePatch}
                    />
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
    </main>
  );
}

function YearSelector({
  year,
  onChange,
}: {
  year: number;
  onChange: (next: number) => void;
}) {
  const current = new Date().getFullYear();
  const options = [current + 1, current, current - 1, current - 2];
  return (
    <div className="flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.06em]">
      {options.map((y) => (
        <button
          key={y}
          type="button"
          onClick={() => onChange(y)}
          className={
            y === year
              ? "rounded-sm border border-accent bg-surface-2 px-3 py-1 text-ink-1"
              : "rounded-sm border border-hairline bg-surface-1 px-3 py-1 text-ink-3 hover:text-ink-1 transition-colors"
          }
        >
          {y}
        </button>
      ))}
    </div>
  );
}

interface PeakRowProps {
  peak: Peak;
  plan: Plan | null;
  pending: boolean;
  onToggle: () => void;
  onPatch: (planId: string, payload: Partial<Plan>) => Promise<void>;
}

function PeakRow({ peak, plan, pending, onToggle, onPatch }: PeakRowProps) {
  const [expanded, setExpanded] = useState(false);
  const checked = plan !== null;

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          disabled={pending}
          aria-pressed={checked}
          aria-label={
            checked ? `Usuń plan: ${peak.nazwa}` : `Dodaj plan: ${peak.nazwa}`
          }
          className={
            checked
              ? "h-5 w-5 flex-shrink-0 rounded-sm border-2 border-alt-summit bg-alt-summit"
              : "h-5 w-5 flex-shrink-0 rounded-sm border-2 border-ink-3 bg-transparent hover:border-ink-1 transition-colors"
          }
        >
          {checked ? (
            <svg
              viewBox="0 0 16 16"
              fill="none"
              className="h-full w-full"
              aria-hidden="true"
            >
              <path
                d="M3 8l3 3 7-7"
                stroke="var(--surface-0)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : null}
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate font-serif text-[16px] text-ink-1">
            {peak.nazwa}
          </p>
        </div>

        {peak.height !== undefined ? (
          <p className="flex-shrink-0 font-mono text-[12px] tabular-nums text-ink-3">
            {peak.height} m
          </p>
        ) : null}

        {checked ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex-shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3 hover:text-ink-1 transition-colors"
            aria-expanded={expanded}
          >
            {expanded ? "schowaj" : "edytuj"}
          </button>
        ) : null}
      </div>

      {checked && expanded && plan ? (
        <PlanEditor plan={plan} onSave={(payload) => onPatch(plan.id, payload)} />
      ) : null}
    </div>
  );
}

interface PlanEditorProps {
  plan: Plan;
  onSave: (payload: Partial<Plan>) => Promise<void>;
}

function PlanEditor({ plan, onSave }: PlanEditorProps) {
  const [month, setMonth] = useState(plan.target_month?.toString() ?? "");
  const [status, setStatus] = useState<Plan["status"]>(plan.status);
  const [routeIdea, setRouteIdea] = useState(plan.route_idea ?? "");
  const [notes, setNotes] = useState(plan.notes ?? "");
  const [stravaId, setStravaId] = useState(plan.strava_id ?? "");
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    // Build payload incrementally so optional fields are omitted (not
    // set to `undefined`) — strict tsconfig with `exactOptionalPropertyTypes`
    // distinguishes "absent" from "present-and-undefined".
    const payload: Partial<Plan> = { status };
    if (month !== "") payload.target_month = Number(month);
    const routeIdeaTrim = routeIdea.trim();
    if (routeIdeaTrim) payload.route_idea = routeIdeaTrim;
    const notesTrim = notes.trim();
    if (notesTrim) payload.notes = notesTrim;
    const stravaIdTrim = stravaId.trim();
    if (stravaIdTrim) payload.strava_id = stravaIdTrim;

    try {
      await onSave(payload);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={save}
      className="flex flex-col gap-3 border-t border-hairline bg-surface-2 px-4 py-4"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
            miesiąc
          </span>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-sm border border-hairline bg-surface-1 px-3 py-2 font-sans text-sm text-ink-1"
          >
            {MONTHS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
            status
          </span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Plan["status"])}
            className="rounded-sm border border-hairline bg-surface-1 px-3 py-2 font-sans text-sm text-ink-1"
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
          droga / wariant
        </span>
        <input
          type="text"
          value={routeIdea}
          onChange={(e) => setRouteIdea(e.target.value)}
          maxLength={500}
          className="rounded-sm border border-hairline bg-surface-1 px-3 py-2 font-sans text-sm text-ink-1"
          placeholder="np. drogą Martina, granią od północy…"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
          notatki
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={4000}
          rows={3}
          className="rounded-sm border border-hairline bg-surface-1 px-3 py-2 font-sans text-sm text-ink-1 resize-y"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
          strava trail id (po wyjściu)
        </span>
        <input
          type="text"
          value={stravaId}
          onChange={(e) => setStravaId(e.target.value)}
          placeholder="strava-12345678"
          pattern="[a-z0-9_-]{1,64}"
          className="rounded-sm border border-hairline bg-surface-1 px-3 py-2 font-mono text-sm text-ink-1"
        />
      </label>

      <div className="flex items-center justify-end gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-sm border border-accent bg-accent px-4 py-2 font-mono text-[12px] uppercase tracking-[0.06em] text-surface-0 disabled:opacity-50"
        >
          {saving ? "zapisuję…" : "zapisz"}
        </button>
      </div>
    </form>
  );
}
