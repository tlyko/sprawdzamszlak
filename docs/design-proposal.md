# sprawdzamszlak.pl — design proposal

Status: draft, owner review pending
Author: frontend-designer agent, written overnight 2026-05-03 → 2026-05-04
Scope: visual + structural redesign of `apps/web/`, single-PR-able slices, no backend asks beyond what already exists

---

## 0. TL;DR for the 7am coffee

The current site is a raw Leaflet canvas with OSM tiles and no chrome. It works — peaks load, trails render — but it has nothing to say. There is no title, no name, no orientation. A first-time visitor sees the whole Carpathian arc covered in OSM's brown peak triangles (which aren't ours) and a "Przybliż mapę" hint in a white box. There is no way to tell that this is a personal mountain log built by one person.

I'm recommending **Direction B: Logbook with map-as-spine** — the home page is a quiet, dark, paper-textured list of trips going back in time, with a persistent map column that follows the cursor. Click a trip, the map flies to it. No splash hero, no scroll-driven manifesto, no "trusted by". The map is always visible, never the entire surface.

The reasoning, three discarded directions, a token system, tile-and-styling choices, and a 5-PR implementation order are below. Total length aims for a single morning read.

---

## 1. Honest critique of what's there now

I opened both screenshots in `.playwright-mcp/`. Here is what I see, in order of severity.

**No identity.** The browser tab says "Create Next App". The page has no header, no logotype, no `<h1>`. A visitor who lands on `sprawdzamszlak.pl` from a link sees a map of southern Poland and Slovakia and has no way to know what they're looking at, who made it, or why. This is the single biggest miss.

**OSM tiles are the wrong substrate.** They were the right *first* substrate — free, instant, no signup. But they carry editorial decisions that aren't ours: the brown triangles all over the screenshot are OSM's `peak` symbology rendered by the standard Carto style, which means our 24 curated peaks are competing visually with hundreds of OSM-tagged peaks we don't care about. The yellow/red road lines, the green forest fills, the village labels in Polish-and-Slovak interleaved — all editorial noise for a Tatra-mountaineering log. The tiles also look like Google Maps from 2010, which signals "demo" not "considered".

**Trails are nearly invisible.** The dashed `#007bff` lines at weight 2 against OSM's busy green-and-yellow palette disappear except where they cross white snow patches. On a 1440 desktop they take a deliberate squint to find. On the mobile screenshot at 390px wide they are functionally invisible.

**Peak markers are doubly wrong.** They only appear above zoom 12, with a "Przybliż mapę" hint as the only signal. So the default landing view shows nothing of ours — no peaks, barely any trails. We have given the visitor a generic OSM tile and asked them to do work to find our content. Then when they zoom in, the markers are 6px white-fill black-stroke circles, indistinguishable from a generic POI dot. Nothing about them communicates "Gerlach 2655 m" vs "Mała Buczynowa Turnia 2172 m" — no altitude hierarchy, no significance ranking.

**Popups are 2008-DOM-string ugly.** Inline `style.cssText`, `font-size: 1.2rem`, default Leaflet white-square chrome with the stem. They work. They scream "wireframe".

**The mobile experience is just the desktop scaled down.** No bottom sheet, no responsive interaction model. On a phone you cannot easily inspect a peak (the tap targets are 6px), and the "Przybliż mapę" overlay covers what little detail is visible.

**One thing that *does* work:** the geometry is real and the data is honest. There's no stock photography, no fake content, no placeholder lorem-ipsum. The site shows the actual database. That's the foundation we should preserve — the redesign is about giving that data a stage, not adding theatre on top.

---

## 2. Three directions

I sketched four and threw one out. Here are the survivors.

### Direction A — Pure map app

The map is the entire surface. No header, no separate landing route. The branding lives as a small, glassy logotype top-left over the map ("sprawdzamszlak"), and a single hamburger or `cmd+k` opens a slide-out panel listing trips and peaks. Inspiration: gaiagps.com, caltopo.com, fatmap pre-Strava.

*Pro:* intellectually honest with "mapa jako element narracji" — there is no narrative outside the map. Cheapest to build (one route). Best for the actual single-user use case (owner opens the site to see his own data on a map).

*Con:* a first-time visitor still has nothing to read. If the owner ever wants to share a link with another taternik who's never heard of the site, there is no orientation, no "what is this", no name visible without an interaction. Also: every interesting bit of metadata (trip notes, dates, altitude profile) is hidden one click deep — the map is everything but a map alone is thin.

*Verdict:* too austere. Closes the door on "open it up later" stated in CLAUDE.md.

### Direction B — Logbook with map-as-spine

The home is a vertical list of trips, newest first, in a left column 380–460px wide. The right column is a persistent map. Hovering a trip in the list dims the others on the map and brightens that one's polyline; clicking flies the map to the trip's bounding box and opens a detail panel that grows the left column to ~640px. The header is one line: site name in serif, a couple of nav items in mono, no hero image.

A peak page (`/szczyty/gerlach`) and a trip page (`/trasy/2025-04-12-cubryna-pn-zach`) are the same template — the panel content changes, the map stays.

Inspiration: a paper expedition logbook (date stamp, location, vertical, notes), Footprint Maps, the Caltopo-but-personal feeling. The serif accent and topographic feel come from old WIG maps — sand-coloured paper with hairline contours.

*Pro:* preserves the "mapa jako element narracji" — the map is permanent, never a separate "view". Solves the first-visit problem (you see a list of named trips immediately, in Polish, dated, with vertical and distance — instant comprehension of "this is one person's hiking log"). Naturally extends as Strava feeds in more activities. Mobile collapses cleanly: list becomes the surface, map becomes a peek-up sheet.

*Con:* more layout work than Direction A. Needs a real type system. The persistent two-column requires the map to be performant during list interactions (hover-dim across 50+ polylines).

*Verdict:* this is what I'd build.

### Direction C — Story-first scroll landing

A separate `/` route that is a scroll-driven narrative — fullscreen map fly-throughs, prose interludes, photo + map pairs — culminating in a "wejdź do logbooka" link to the actual app at `/log` or similar. Inspiration: New York Times scrollytelling, fatmap's old marketing pages.

*Pro:* maximum character. If executed well, the most memorable.

*Con:* huge build, easy to overcook, requires Framer Motion or a scroll-driven animation library (extra dependency cost flagged by CLAUDE.md), and most of all — **it serves a marketing goal that doesn't exist**. CLAUDE.md is explicit: "Nie projektujemy pod konwersję (nie ma co konwertować — to nie biznes)." There's no funnel. Scrollytelling is a tool for converting strangers; the owner is not converting strangers. He is using his own app, occasionally showing it to friends. The cost-benefit is wrong.

*Verdict:* discard. Save the scrollytelling impulse for one beautiful "About" page later if you ever want it.

---

## 3. Recommendation

**Direction B — Logbook with map-as-spine.** Reasons, ranked:

1. It serves the owner's daily use case (open the site, see what I've done, click into one) better than A or C.
2. It serves the "show this to a friend" case — the friend sees a named, dated list of trips immediately and understands the project in 5 seconds without scrolling.
3. It honours "mapa jako element narracji" more honestly than C, because the map is *always* the spine, not a payoff at the bottom of a scroll.
4. It scales with Strava feeding in activities. The list naturally grows. The map naturally densifies. No redesign needed at 100 trips.
5. It leaves room to "open it up later" without a rewrite — adding a second user means adding a `/u/:slug` route that uses the same template.
6. It's buildable in 4–5 PRs of a few hours each, slotting around the W4–W6 Strava sprint.

The trade-off I'm consciously making: this is *less of a wow moment* than C. A first visitor will not gasp. They will, instead, lean in and read trip names. That's the right trade for this audience.

---

## 4. Component & layout breakdown

### Routes

```
apps/web/app/
├── layout.tsx                    [REWRITE] root: serif+sans tokens, dark default, <Header />
├── page.tsx                      [REWRITE] / : Logbook view (list + map)
├── trasy/
│   └── [slug]/page.tsx           [NEW]    /trasy/:slug : trip detail (server-rendered metadata, client map)
├── szczyty/
│   └── [slug]/page.tsx           [NEW]    /szczyty/:slug : peak detail
├── o-projekcie/page.tsx          [NEW]    /o-projekcie : 200-word manifest, no map
├── strava/page.tsx               [RESTYLE] keep flow, restyle to match
└── strava/connected/page.tsx     [RESTYLE] same
```

### Components

```
apps/web/components/
├── map/
│   ├── TatraMap.tsx              [REWRITE] thinner: no fetch, takes peaks/trails as props
│   ├── trail-style.ts            [NEW]    style functions per trail.type / activity_type
│   ├── peak-marker.tsx           [NEW]    custom DivIcon, altitude-tiered
│   ├── tile-layers.ts            [NEW]    named tile configs (Stadia Outdoors, OSM fallback)
│   └── use-map-fly.ts            [NEW]    hook: flyTo with prefers-reduced-motion respect
├── logbook/
│   ├── trip-list.tsx             [NEW]    vertical list, virtualized once it grows
│   ├── trip-row.tsx              [NEW]    one row: date · name · vertical · distance
│   ├── trip-detail-panel.tsx     [NEW]    expanded panel state for selected trip
│   └── elevation-profile.tsx     [NEW]    SVG, no chart lib (see §5 motion)
├── chrome/
│   ├── header.tsx                [NEW]    one-line header
│   ├── footer.tsx                [NEW]    minimal, kontakt + projekt link
│   └── command-palette.tsx       [LATER]  cmd+k, deferred to PR 4
└── ui/
    ├── pill.tsx                  [NEW]    small label chip (off-piste / oficjalny / ski)
    ├── stat.tsx                  [NEW]    label + monospace number
    └── separator.tsx             [NEW]    hairline divider with paper-grain texture option
```

### Data shape

Already available from existing API:
- `GET /` → `Peak[]` with `nazwa, trudnosc, latitude, longitude, height`
- `GET /routes` → `Trail[]` with `id, name, type, geojson_url`

Needed but not blocking — can ship Direction B with placeholders and wire as data lands:
- `Trail.date` (UTC timestamp) — Strava import gives us this
- `Trail.distance_m, vertical_m, duration_s` — derivable from GPX (W3 parser)
- `Trail.activity_type` — `hike | scramble | climb | ski_tour | run`
- `Trail.notes` — optional free text, manual or Strava description

For PR 1 the list can render with date placeholders pulled from a hardcoded mapping or omitted entirely. The redesign should not block on backend.

### Layout — desktop

```
┌─────────────────────────────────────────────────────────────────┐
│ sprawdzamszlak                              trasy · szczyty · o │  ← header, 56px, hairline bottom
├──────────────┬──────────────────────────────────────────────────┤
│              │                                                  │
│  2025        │                                                  │
│  ─────────   │                                                  │
│  12 kwi      │                                                  │
│  Cubryna PN- │                                                  │
│  Zach żebro  │              [ MAP, persistent ]                 │
│  +1240 · 8.4 │                                                  │
│  · taterni   │                                                  │
│              │                                                  │
│  03 kwi      │                                                  │
│  Świnica     │                                                  │
│  +980 · 11.2 │                                                  │
│  · wsp. zim  │                                                  │
│              │                                                  │
│  ...         │                                                  │
│              │                                                  │
└──────────────┴──────────────────────────────────────────────────┘
   420px                     fluid, min 700px
```

Hovering a row in the left list highlights the trip on the map (others dim to 25% opacity). Clicking a row expands the row in place into a detail card with elevation profile + notes + GPX download, and the map flies to fit the trip's bounds with 80px padding.

### Layout — mobile

The map sits at the top as a 40vh slab (not full-screen). Below it is the trip list. Tapping a trip pushes a full-screen detail route (`/trasy/[slug]`). This trades the persistent-map idea for legibility — on a phone the list is the primary surface, and the trip detail page is its own thing. An optional "rozwiń mapę" button at the top of the map slab toggles to 90vh fullscreen for browsing.

```
┌────────────────────┐
│   sprawdzamszlak ☰ │
├────────────────────┤
│                    │
│       [MAP]        │  40vh
│                    │
├────────────────────┤
│ 12 kwi             │
│ Cubryna PN-Zach    │
│ +1240 · 8.4 km     │
├────────────────────┤
│ 03 kwi             │
│ Świnica            │
│ ...                │
└────────────────────┘
```

---

## 5. Design tokens

### Palette

The brief says slate, snow, lichen, alpine sky. Here is a system tuned for dark-default with light as opt-in. All checked for AA contrast against their intended pairing.

```
Surface (dark mode default)
--surface-0    #0E1116   night sky, deep — page background
--surface-1    #161A22   panel background (left column, header)
--surface-2    #1F2630   raised panel (selected trip card)
--hairline     #2A3340   1px dividers, never thicker

Ink
--ink-1        #F2EFE6   primary text — slightly warm "snow on north face"
--ink-2        #B8BDC7   secondary text, dates, units
--ink-3        #6E7480   tertiary, captions
--ink-mono     #D7DAE0   monospace stats, slightly cooler

Topographic accents (used ONLY for trails, peaks, altitude bands)
--alpine-sky   #6FA8C4   on-piste / oficjalny szlak
--lichen       #8FA678   approach / podejście
--rusalka      #C4744A   off-piste / scramble
--firn         #E8E2D2   ski tour
--obsidian     #2A3340   climb / wspinaczka (low-saturation, near-hairline)

Altitude tiers for peak markers
--alt-low      #6E7480   <1500 m
--alt-mid      #B8BDC7   1500–2000 m
--alt-high     #F2EFE6   2000–2400 m
--alt-summit   #FFD27A   >2400 m  (the "summit gold" — only ~6 peaks in the Tatras)

Functional
--accent       #FFD27A   focus rings, key CTA only
--danger       #C5564B   errors, delete confirmations
--success      #7FA177   success states (Strava connected, etc.)
```

Light mode (opt-in via prefers-color-scheme override or future toggle) inverts the surface ramp to a paper palette: `--surface-0: #F4F0E5` (warm WIG-map paper), `--surface-1: #ECE6D6`, `--ink-1: #1B1F26`. Topographic accents keep the same hex values — they're tuned to read on both. This means we don't need two parallel token systems for the colourful bits.

### Typography

Geist is fine but generic — it's the create-next-app default and will read as such. I propose:

- **Sans (UI):** keep Geist Sans for now. Switching adds a font load and Geist is genuinely well-drawn. Revisit only if we want more character.
- **Serif (display):** add **Fraunces** (variable, supports optical sizing) for the `<h1>` site name in the header, trip detail page titles, and the "Logbook" header. Fraunces has a slight expressive quality at display sizes that reads as "considered" without being twee. Loaded via `next/font/google` with `display: 'swap'` — one extra font request, the only one.
- **Mono (data):** keep Geist Mono for stats — distances, vertical, coordinates. Numbers should always be tabular (`font-variant-numeric: tabular-nums`).

Type scale (modular, ratio 1.25, base 16):

```
--text-xs    12px  / 1.4   captions, units (m, km)
--text-sm    14px  / 1.5   body small, secondary
--text-base  16px  / 1.6   body
--text-lg    20px  / 1.4   trip names in list
--text-xl    25px  / 1.3   section heads
--text-2xl   31px  / 1.2   page titles (sans)
--text-3xl   39px  / 1.15  display, serif only (e.g. site name in header)
--text-4xl   49px  / 1.1   reserved for one moment (peak detail page hero number?)
```

### Spacing

8px base, no halves. `space-1` = 8px through `space-12` = 96px. The left-column list uses `space-3` (24px) vertical rhythm between trip rows for breathing room; trip rows internally use `space-1` (8px) between date and name and `space-2` (16px) between name and stats.

### Motion

CLAUDE.md flags every dependency as debt. Honest answer: **don't add Framer Motion for v1.** What we actually need:

- Map flyTo — Leaflet has it built in (`map.flyToBounds` with `duration: 1.2`). Free.
- List row hover dim — CSS `transition: opacity 200ms ease`. Free.
- Detail panel expand — CSS `grid-template-rows` transition or a `max-height` trick. Free.
- Elevation profile draw — single SVG `path` with `stroke-dasharray` animation on mount. Free.

If any of those four aren't enough later, revisit. The "respect prefers-reduced-motion" rule applies to all animations, including Leaflet's flyTo (pass `animate: false` when reduced motion is set).

Total motion budget: 200ms for hover, 1.2s for map fly, 400ms for panel expand. No bouncing, no spring physics, no parallax.

---

## 6. Map specifics

### Tile layer choice

I evaluated five options against three criteria: (a) actually appropriate for mountain use, (b) free at our traffic, (c) permissive licensing.

| Option | Look | Cost | Verdict |
|---|---|---|---|
| OSM standard (current) | Generic, busy, brown-peak-noise | Free, but tile usage policy frowns on production | Move off |
| **Stadia Outdoors** | Cartographic, contour-rich, restrained palette, hill-shading | Free up to 200k tile requests/month with attribution + free API key | **Pick this** |
| OpenTopoMap | Beautiful contours, very "topographic", but cluttered labels | Free, fair-use limits | Strong alternative; labels are too dense |
| Mapbox Outdoors | Clean, modern | $$$ once anyone visits | Reject — vendor lock-in, costs |
| Maptiler Outdoor | Very nice | Free 100k tiles/mo, requires key | Solid backup if Stadia caps |

**Recommendation:** Stadia Outdoors as primary, OSM as fallback if the Stadia key fails (so the site never shows a blank canvas). API key goes in `apps/web/.env.local` as `NEXT_PUBLIC_STADIA_KEY` and is committed to `.env.example` empty.

A future "v2" upgrade path is Maptiler with a custom style JSON tuned to our palette — turn off road labels below zoom 11, hide non-Tatra peaks, emphasize contour lines in the Tatry National Park bounding box. Out of scope for this proposal — explicitly called out in §9.

Alternative if any free tier becomes a headache: serve our own vector tiles from a single Hetzner box running tileserver-gl. Cost ~€5/mo. Worth doing later, not now.

### Trail styling

Replace the single dashed-blue with a system keyed on `trail.type` (current) plus `activity_type` (post-Strava). The colours come from §5's topographic accents.

```
oficjalny szlak     solid    weight 3   #6FA8C4 (alpine-sky)   85% opacity
podejście           solid    weight 2   #8FA678 (lichen)        70% opacity
off-piste / scramble dashed  weight 2.5 #C4744A (rusalka)       90% opacity, dasharray 6 8
ski tour            solid    weight 2.5 #E8E2D2 (firn)          75% opacity, with subtle white glow
wspinaczka          dotted   weight 3   #2A3340 (obsidian)      100% opacity, dasharray 1 6
```

Hover state: weight +1, opacity 100%, no colour change. A bright halo is too much — we already have colour-coding doing the work.

Selected state (when row is clicked in list): weight +2, opacity 100%, all *other* trails drop to 25% opacity and z-index below. This is the "spotlight" effect that makes the persistent-map+list interaction feel coherent.

### Peak markers

Replace `CircleMarker` with custom DivIcon HTML. Three reasons: (1) we can size by altitude tier, (2) we can attach a label that's stylable in CSS, (3) DivIcons hit-test as DOM nodes which is friendlier for keyboard nav later.

Visual hierarchy:

```
>2400m  summit:    9px filled circle, --alt-summit ring,  always labeled
2000-2400m high:   7px filled circle, --alt-high,         label at zoom>=12
1500-2000m mid:    5px outline only, --alt-mid,           label at zoom>=13
<1500m    low:     3px outline,      --alt-low,           label at zoom>=14
```

Label = peak name in Geist Sans 11px + altitude in Geist Mono 10px tabular, on a `--surface-1` pill with 6px padding and 1px `--hairline` border. Anchored 8px right of the marker.

This means the summit-tier peaks (Gerlach, Łomnica, Lodowy, Wysoka, Rysy, Krywań) are *always* visible with name+altitude from any zoom — they become landmarks the eye can navigate by, even at zoom 10. The current "show nothing until zoom 12" design wastes the most important data.

### Zoom level matrix

```
zoom 8-10  Carpathian-arc overview  | summit-tier peaks labeled, no others; only oficjalny szlaki
zoom 11    Tatra overview (default) | + high peaks labeled; all trails visible at 50% opacity; selected trail full
zoom 12    Massif level             | + mid peaks labeled; trails 100% opacity
zoom 13    Valley level             | + low peaks labeled; trail names appear at midpoints
zoom 14+   Approach detail          | everything visible
```

Default zoom should change from 11 to 11 (same), default centre from `[49.23, 20.00]` to `[49.20, 20.05]` (slightly south-east, recenters on the Tatra Wysokie crest where most of the activity is).

---

## 7. Detail panel UX

Two flavors depending on viewport.

**Desktop:** clicking a trip row expands it inline in the left column. The row grows from ~64px tall to ~520px tall. Content top-to-bottom:

```
┌─────────────────────────────┐
│ 12 kwietnia 2025  · sobota  │  date in mono, day name in sans secondary
│                             │
│ Cubryna PN-Zach żebro       │  serif, text-xl
│                             │
│ +1240 m   8.4 km   5h 12m   │  three Stat components, mono, ink-1
│                             │
│ ── pill: taternictwo ──     │
│                             │
│ [ elevation profile SVG  ]  │  120px tall, full width of panel
│                             │
│ Notes paragraph if present, │  text-sm, ink-2
│ wrapped to ~50 chars wide.  │
│                             │
│ ────────────────────────    │
│ pobierz GPX  ·  Strava ↗    │  text-sm links, ink-2 with hover ink-1
└─────────────────────────────┘
```

The map simultaneously: dims other trails to 25%, highlights this trail in full colour with weight+2, flies to the trail's bbox with 80px padding.

Closing the detail (click the row header again, or the X, or Esc) collapses the row back and undims the map.

**Mobile:** clicking a trip row navigates to `/trasy/[slug]` — a full route, not a sheet. The page has the same content top-to-bottom but with the trip's own map at the top (not the global one). This is actually simpler and more shareable (each trip has a URL). On the back button you return to the logbook scrolled to the same row.

**Peak click on map** (any viewport): opens a peak detail card. Smaller than a trip card (no elevation profile, no GPX). Content: name, altitude, "trudność", and a list of trips that summit it ("Byłeś tu 3 razy: 12 kwi 2025, 03 sty 2024, 14 wrz 2022"). On desktop this opens as a floating card anchored to the marker; on mobile as a bottom sheet.

---

## 8. Implementation order

The Strava sprint deadline is 2026-06-15 (W4–W6). Design work has to fit *between* Strava slices. Here's a 5-PR plan, each PR sized to a single evening or weekend morning, no PR depending on Strava work landing first.

### PR 1 — Foundations (no map changes)
*Branch:* `feat/design-tokens-and-chrome`
*Touches:* `app/layout.tsx`, `app/globals.css`, `tailwind.config.ts` (new), `components/chrome/header.tsx`, `components/chrome/footer.tsx`
*Out:* page metadata fixed (title becomes "sprawdzamszlak.pl — kronika tatrzańska" or whatever the owner picks), real `<html lang="pl">`, dark-default colour tokens wired, Fraunces loaded, header with site name + 3 nav links rendered above the existing map, footer with one line + projekt link below.
*Risk:* zero. Map keeps working unchanged underneath.
*Time:* 2–3h.

### PR 2 — Tile layer + peak markers + trail styles
*Branch:* `feat/cartographic-pass`
*Touches:* `components/TatraMap.tsx` (split into smaller files per §4), `components/map/*`
*Out:* Stadia Outdoors tiles wired, OSM fallback. Peak DivIcons with altitude-tier sizing and always-on summit labels. Trail style system (per `trail.type`). Zoom-tier visibility rules. The map looks like *ours*, not OSM's.
*Risk:* low — purely visual swap. Stadia key needed (free signup, ~5min).
*Time:* 4–5h.

### PR 3 — Logbook layout (desktop + mobile)
*Branch:* `feat/logbook-home`
*Touches:* `app/page.tsx` (rewrite), `components/logbook/*`, `components/ui/*`
*Out:* the two-column desktop layout with persistent map and trip list; mobile stacked layout. Hover-dim wired. Click-to-fly wired. List uses whatever trip metadata is available — at minimum name + type pill. If date/distance/vertical are absent, placeholders.
*Depends on:* PR 1, PR 2.
*Risk:* medium — first time the list-and-map talk to each other. State management: a single `selectedTripId` in `app/page.tsx`, passed to both list and map.
*Time:* one weekend morning, ~5h.

### PR 4 — Trip detail panel + elevation profile
*Branch:* `feat/trip-detail`
*Touches:* `components/logbook/trip-detail-panel.tsx`, `components/logbook/elevation-profile.tsx`, `app/trasy/[slug]/page.tsx`
*Out:* expanded panel in-place on desktop, full route on mobile. SVG elevation profile (no chart lib). GPX download link. Notes rendering.
*Depends on:* GPX parser landing distance/vertical data. If parser is delayed, ship the panel without elevation profile and add it later.
*Risk:* low–medium. Elevation profile is the only real new thing.
*Time:* 3–4h.

### PR 5 — Peak pages + Strava page restyle
*Branch:* `feat/peak-pages-and-strava-restyle`
*Touches:* `app/szczyty/[slug]/page.tsx`, `app/o-projekcie/page.tsx`, `app/strava/page.tsx`, `app/strava/connected/page.tsx`
*Out:* peak detail route + popup card. About page (200 words, no map). Strava pages restyled to match the new chrome (stop using inline `style={}` and `system-ui`).
*Risk:* trivial.
*Time:* 2h.

**Total realistic effort:** 16–19h spread across 5 PRs over 3–4 weeks, none of them blocking Strava work, none of them larger than a single sitting.

The owner can stop after any PR and the site is in a better state than before.

---

## 9. Out of scope

Things I considered and consciously rejected:

- **Framer Motion / motion library.** Native CSS + Leaflet's built-in animation cover everything we need at v1. Adding a 30KB+ runtime dependency for two transitions is the wrong trade per CLAUDE.md.
- **shadcn/ui.** Would be fine, but for the 4 primitives we need (pill, stat, separator, sheet) writing them by hand is faster than installing the CLI and figuring out tokens-vs-shadcn-tokens conflicts.
- **Custom Maptiler vector tile style.** The right long-term answer for full editorial control. Wrong for v1 — Stadia Outdoors gets us 90% there for $0 and zero hours. Revisit if we ever want to hide non-Tatra peaks at the tile level.
- **Search / command palette (cmd+k).** Genuinely useful eventually. Not at 7 trips. Add when the list passes 30 entries.
- **Photo gallery per trip.** Tempting. Requires backend work (S3 photos endpoint, upload UI) that isn't in any sprint. Park it as "v2 if owner wants".
- **3D terrain (Cesium / MapLibre + RGB DEM).** Beautiful, expensive, slow on mobile, overkill for a logbook. The owner can check `mapy.cz`'s 3D mode for that.
- **Social features.** Comments, likes, sharing, public trip URLs with og:image. CLAUDE.md says single-user. Each of these is a separate project.
- **Dark/light toggle UI.** Dark default with `prefers-color-scheme: light` override is enough. Toggle is a UI element that costs space and a state primitive for nearly no benefit at v1.
- **Onboarding / empty states / error illustrations.** This is a single-user site. There is no onboarding. Errors should be one line of text in `--danger`, not a "we couldn't find that trip 🏔️" with an illustration.
- **Internationalization.** Polish only. The owner's audience is Polish.
- **Analytics.** Out of scope. If ever added, Plausible self-hosted on the same Cloudflare worker, no cookies.

---

## 10. Confidence ranking — push back here

In descending order of how sure I am.

1. **Highest confidence:** Direction B over A and C. The map-as-spine logbook is the right shape for this product and this user. Strong opinion.
2. **High:** Stadia Outdoors as the tile layer. Easiest single change with the biggest visual payoff. The only risk is the free-tier cap, which is generous.
3. **High:** Killing the "show nothing below zoom 12" rule and labeling summit-tier peaks at every zoom. Currently the default view shows zero of our content. That has to change.
4. **Medium:** The dark-default palette. The hex values are tuned but I haven't seen them on a real screen with real data — they will need a single afternoon of iteration once PR 1 lands. The summit-gold (`#FFD27A`) is the riskiest accent — if it reads too "warning yellow", the alternative is `#F2EFE6` (firn-white) and just relying on size.
5. **Medium:** Adding Fraunces. Geist alone might be enough; the serif accent is character but also one extra font request and a load of opinion. I'd ship PR 1 with Fraunces and pull it if the owner doesn't like it after a day. Cheap to revert.
6. **Lower:** The mobile interaction model — list-as-primary with a 40vh map slab and full-route trip detail. I'm advocating *against* a fancy bottom sheet here because it's complex and the trip detail benefits from being a real shareable URL. But a reasonable person could argue for the sheet pattern. Worth a 30-min back-and-forth before PR 3.
7. **Lowest confidence:** Whether the trip list should be reverse-chronological flat (my proposal) or grouped by year/season with sticky headers (`2025 — wiosna`, `2024 — zima`). Flat is simpler now. Grouped is nicer at 50+ trips. I'd ship flat and revisit when the list crosses ~25 entries. Not worth deciding now.

— end —
