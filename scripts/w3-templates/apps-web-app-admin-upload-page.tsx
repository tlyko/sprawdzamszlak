// /admin/upload — multipart form. Submits to /api/admin/upload via fetch;
// the browser handles HTTP Basic prompt automatically when the API responds
// with 401 + WWW-Authenticate (per ADR-002 SSG revision).

'use client';

import { useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

interface UploadResult {
  ok: boolean;
  message: string;
  details?: unknown;
}

export default function UploadPage() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setResult(null);

    const form = e.currentTarget;
    const formData = new FormData(form);

    try {
      const res = await fetch(`${API_URL}/admin/upload`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      setResult({
        ok: res.ok,
        message: res.ok ? 'Uploaded' : (body.message as string) ?? `HTTP ${res.status}`,
        details: body,
      });
      if (res.ok) form.reset();
    } catch (err) {
      setResult({ ok: false, message: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ padding: '24px', maxWidth: 720, margin: '0 auto' }}>
      <h1>Upload GPX</h1>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
        <label>
          Slug (id): <br />
          <input
            name="id"
            required
            pattern="[a-z0-9_]{1,64}"
            placeholder="rysy_2026_05_15"
            style={{ width: '100%', padding: 6 }}
          />
        </label>
        <label>
          Name: <br />
          <input name="name" required maxLength={200} style={{ width: '100%', padding: 6 }} />
        </label>
        <label>
          Type: <br />
          <select name="type" required style={{ width: '100%', padding: 6 }}>
            <option value="off-piste">off-piste</option>
            <option value="official">official</option>
          </select>
        </label>
        <label>
          GPX file: <br />
          <input name="gpx" type="file" accept=".gpx,application/gpx+xml,application/xml" required />
        </label>
        <button type="submit" disabled={busy} style={{ padding: '8px 16px' }}>
          {busy ? 'Uploading…' : 'Upload'}
        </button>
      </form>

      {result && (
        <pre
          style={{
            marginTop: 16,
            padding: 12,
            background: result.ok ? '#e6ffed' : '#ffe6e6',
            border: `1px solid ${result.ok ? '#3fb950' : '#d33'}`,
            whiteSpace: 'pre-wrap',
          }}
        >
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </main>
  );
}
