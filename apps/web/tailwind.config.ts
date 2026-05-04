import type { Config } from "tailwindcss";

/*
 * Tailwind v4 derives most config from CSS via @theme (see app/globals.css)
 * and auto-detects content paths from the project root. This file exists to:
 *
 * 1. Make the design-token surface explicit and grep-able.
 * 2. Reserve a place for plugins (typography, container queries) that
 *    Tailwind v4 still configures via JS/TS.
 * 3. Match the file inventory promised in docs/design-proposal.md §8 (PR 1).
 *
 * Do not duplicate token values here — they live in globals.css under @theme.
 * Adding a value in two places guarantees one of them goes stale.
 */
const config: Config = {
  // Explicit content paths are belt-and-braces in v4; Tailwind otherwise
  // auto-discovers from the working directory. Listing them here documents
  // which file trees can use Tailwind classes.
  content: [
    "./app/**/*.{ts,tsx,mdx}",
    "./components/**/*.{ts,tsx,mdx}",
  ],
  plugins: [],
};

export default config;
