// /admin landing — links to upload + future actions. Static page, no auth
// gate at the web layer (per ADR-002 revision: SSG can't run middleware).
// Anything sensitive is behind an API call which the browser auths via
// the standard 401 → Basic prompt → replay flow.

import Link from 'next/link';

export default function AdminHome() {
  return (
    <main style={{ padding: '24px', maxWidth: 720, margin: '0 auto' }}>
      <h1>Admin</h1>
      <p>
        Operations available here mutate production data. Each action prompts for
        admin credentials in the browser; nothing is stored client-side.
      </p>
      <ul>
        <li>
          <Link href="/admin/upload">Upload GPX → GeoJSON</Link>
        </li>
      </ul>
    </main>
  );
}
