// requireAdmin: HTTP Basic Auth check against ADMIN_USER / ADMIN_PASS env vars.
// Returns null on success, or a 401 response with WWW-Authenticate so the
// browser prompts the user automatically.

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

const ADMIN_USER = process.env.ADMIN_USER ?? '';
const ADMIN_PASS = process.env.ADMIN_PASS ?? '';

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function unauthorized(): APIGatewayProxyResultV2 {
  return {
    statusCode: 401,
    headers: {
      'Content-Type': 'application/json',
      'WWW-Authenticate': 'Basic realm="admin"',
    },
    body: JSON.stringify({ message: 'Authentication required' }),
  };
}

export function requireAdmin(event: APIGatewayProxyEventV2): APIGatewayProxyResultV2 | null {
  if (!ADMIN_USER || !ADMIN_PASS) {
    // Misconfiguration: the deployment is missing creds. Reject all admin
    // requests rather than silently allowing or 500-ing.
    return unauthorized();
  }

  const authHeader = event.headers?.['authorization'] ?? event.headers?.['Authorization'] ?? '';
  if (!authHeader.startsWith('Basic ')) {
    return unauthorized();
  }

  const encoded = authHeader.slice('Basic '.length).trim();
  let decoded: string;
  try {
    decoded = Buffer.from(encoded, 'base64').toString('utf-8');
  } catch {
    return unauthorized();
  }

  const sep = decoded.indexOf(':');
  if (sep < 0) return unauthorized();

  const user = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);

  if (!timingSafeEqual(user, ADMIN_USER) || !timingSafeEqual(pass, ADMIN_PASS)) {
    return unauthorized();
  }

  return null; // authenticated
}
