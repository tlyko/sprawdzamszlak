// GET /admin/ping — smoke endpoint for the CF Access auth flow (ADR-008).
//
// Returns 200 + the verified email when called with a valid CF Access
// JWT. Used to verify the full chain end-to-end:
//   browser → CF Access (login) → cookie → API GW → Lambda → JWT verify
// without any business-logic side effects.

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { requireAdmin } from '../auth/cf-access.js';

export async function handlePing(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const identity = await requireAdmin(event);
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, email: identity.email }),
  };
}
