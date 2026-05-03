import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Static export for Cloudflare Workers + Static Assets deploy.
  // The frontend is purely client-side (TatraMap is dynamic({ ssr: false }))
  // so SSG with `output: 'export'` produces a self-contained `out/` directory
  // that can be served as static assets without an SSR runtime.
  output: 'export',

  // `next/image` is unused today but if it's added later, it would require
  // a custom loader under static export. Pre-set to safest value.
  images: { unoptimized: true },

  // Predictable URLs and 404 handling on Cloudflare without rewrite rules.
  trailingSlash: true,
};

export default nextConfig;
