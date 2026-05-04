/*
 * Client-side OG/Twitter meta-tag injection.
 *
 * Static export means we can't render per-route metadata server-side. Bots
 * that don't execute JS see the default title/description from
 * `app/layout.tsx`; clients (and JS-aware crawlers) see the per-trip values
 * after this hook fires. Issue #47 makes that trade-off explicit.
 *
 * The hook patches title + a fixed list of meta tags in document.head, then
 * restores their previous values on unmount so a later visit to another
 * route doesn't inherit a stale trip's preview. Each tag tracks "did we
 * insert it?" so the restore deletes our injections instead of leaving
 * empty placeholders.
 */
"use client";

import { useEffect } from "react";

interface OgMetaInput {
  title: string;
  description: string;
  url: string;
  /** og:type — "article" for trips, "website" elsewhere. Defaults to article. */
  type?: string;
}

const META_TAGS: ReadonlyArray<{ key: string; selector: string; attr: "name" | "property" }> = [
  { key: "description", selector: 'meta[name="description"]', attr: "name" },
  { key: "og:title", selector: 'meta[property="og:title"]', attr: "property" },
  { key: "og:description", selector: 'meta[property="og:description"]', attr: "property" },
  { key: "og:type", selector: 'meta[property="og:type"]', attr: "property" },
  { key: "og:url", selector: 'meta[property="og:url"]', attr: "property" },
  { key: "twitter:card", selector: 'meta[name="twitter:card"]', attr: "name" },
  { key: "twitter:title", selector: 'meta[name="twitter:title"]', attr: "name" },
  { key: "twitter:description", selector: 'meta[name="twitter:description"]', attr: "name" },
];

export function useOgMeta(input: OgMetaInput | null): void {
  useEffect(() => {
    if (!input || typeof document === "undefined") return;

    const previousTitle = document.title;
    const inserted: HTMLMetaElement[] = [];
    const restored: Array<{ el: HTMLMetaElement; previous: string }> = [];

    document.title = input.title;

    const values: Record<string, string> = {
      description: input.description,
      "og:title": input.title,
      "og:description": input.description,
      "og:type": input.type ?? "article",
      "og:url": input.url,
      "twitter:card": "summary",
      "twitter:title": input.title,
      "twitter:description": input.description,
    };

    for (const { key, selector, attr } of META_TAGS) {
      const value = values[key];
      if (!value) continue;
      let el = document.head.querySelector<HTMLMetaElement>(selector);
      if (el) {
        restored.push({ el, previous: el.content });
        el.content = value;
      } else {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        el.content = value;
        document.head.appendChild(el);
        inserted.push(el);
      }
    }

    return () => {
      document.title = previousTitle;
      for (const { el, previous } of restored) {
        el.content = previous;
      }
      for (const el of inserted) {
        el.remove();
      }
    };
  }, [input]);
}
