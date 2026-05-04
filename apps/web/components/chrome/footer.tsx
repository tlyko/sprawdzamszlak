/*
 * Single-line footer. One sentence + GitHub link, nothing else. The 40px
 * height matches --footer-h in globals.css. No copyright, no cookies notice
 * (we don't set any — see CLAUDE.md "Out of scope" / analytics).
 */

const REPO_URL = "https://github.com/tlyko/sprawdzamszlak";

export function Footer() {
  return (
    <footer
      className="border-t border-hairline bg-surface-1 text-ink-3"
      style={{ height: "var(--footer-h)" }}
    >
      <div className="mx-auto flex h-full max-w-[1400px] items-center justify-between px-4 sm:px-6 text-[12px]">
        <span className="font-mono">
          osobista kronika tatrzańska
        </span>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="font-mono hover:text-ink-1 transition-colors duration-200"
        >
          github ↗
        </a>
      </div>
    </footer>
  );
}
