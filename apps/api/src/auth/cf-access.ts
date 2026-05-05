// Cloudflare Access JWT verification (ADR-008 D4 — defense-in-depth).
//
// Cloudflare Access already gates inbound traffic to the API GW custom
// domain (api.sprawdzamszlak.pl) — a request without a valid CF session
// never reaches this Lambda when it goes through the public hostname.
// We re-verify the JWT in code anyway because:
//   1. The legacy execute-api URL (akoz890bg6...) is still live and is
//      NOT behind CF Access. Any request hitting it must still be
//      challenged.
//   2. If the CF Access app is ever misconfigured (policy disabled,
//      bypass mode toggled), the Lambda must remain locked.
//   3. "Owner identity lives in code" — `email == owner_email` check
//      is auditable in this repo, not only in a SaaS dashboard.
//
// CF injects the signed JWT into `Cf-Access-Jwt-Assertion` header on
// every authenticated proxied request. Verification:
//   - Signature: RS256, public keys from <team>.cloudflareaccess.com/cdn-cgi/access/certs
//   - Issuer:    https://<team>.cloudflareaccess.com (matches signing source)
//   - Audience:  CF Access "AUD" tag (per-application identifier from the
//                application's "Overview" tab in the dashboard)
//   - Email:     equals the configured owner email (single-user policy)
//
// Config lives in SSM, read lazily on the first /admin/* request and
// cached for the warm-invocation lifetime. Cold-start cost: 3 SSM reads
// + JWKS fetch (~200ms total). Warm hits: zero round-trips.

import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';
import { GetParameterCommand } from '@aws-sdk/client-ssm';
import { ssm } from '../clients.js';

const PARAM_TEAM_DOMAIN = '/sprawdzamszlak/cf-access/team_domain';
const PARAM_AUD = '/sprawdzamszlak/cf-access/aud';
const PARAM_OWNER_EMAIL = '/sprawdzamszlak/admin/owner_email';

export class UnauthorizedError extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = 'UnauthorizedError';
  }
}

export class AuthNotConfiguredError extends Error {
  constructor(public detail: string) {
    super(detail);
    this.name = 'AuthNotConfiguredError';
  }
}

interface AdminConfig {
  teamDomain: string;
  audience: string;
  ownerEmail: string;
  issuer: string;
}

let cachedConfig: AdminConfig | undefined;
let cachedJwks: JWTVerifyGetKey | undefined;

async function loadConfig(): Promise<AdminConfig> {
  if (cachedConfig) return cachedConfig;

  // GetParameters batches up to 10 names in one call. We have 3 — single round-trip.
  const out = await ssm.send(
    new GetParameterCommand({ Name: PARAM_TEAM_DOMAIN }),
  );
  const audOut = await ssm.send(new GetParameterCommand({ Name: PARAM_AUD }));
  const emailOut = await ssm.send(
    new GetParameterCommand({ Name: PARAM_OWNER_EMAIL }),
  );

  const teamDomain = out.Parameter?.Value;
  const audience = audOut.Parameter?.Value;
  const ownerEmail = emailOut.Parameter?.Value;

  if (!teamDomain || !audience || !ownerEmail) {
    throw new AuthNotConfiguredError(
      `missing SSM params (teamDomain=${!!teamDomain}, aud=${!!audience}, email=${!!ownerEmail})`,
    );
  }

  // Sanity-check shapes so a typo'd CF dashboard value doesn't reach
  // jose's verifier as a junk string.
  if (!teamDomain.endsWith('.cloudflareaccess.com')) {
    throw new AuthNotConfiguredError(`team_domain has wrong shape: ${teamDomain}`);
  }
  if (audience.length < 32) {
    throw new AuthNotConfiguredError(`aud looks too short to be a CF Access AUD tag`);
  }
  if (!ownerEmail.includes('@')) {
    throw new AuthNotConfiguredError(`owner_email is not an email`);
  }

  const config: AdminConfig = {
    teamDomain,
    audience,
    ownerEmail,
    issuer: `https://${teamDomain}`,
  };
  cachedConfig = config;
  return config;
}

function getJwks(config: AdminConfig): JWTVerifyGetKey {
  if (cachedJwks) return cachedJwks;
  cachedJwks = createRemoteJWKSet(
    new URL(`${config.issuer}/cdn-cgi/access/certs`),
    {
      // jose's default cooldown / cache is sensible for our throughput; we
      // don't need to override.
    },
  );
  return cachedJwks;
}

export interface AdminIdentity {
  email: string;
}

/**
 * Verifies the CF Access JWT on the incoming event. Throws
 * UnauthorizedError on any verification failure (missing JWT, bad
 * signature, wrong aud/iss, email not allowlisted).
 *
 * Throws AuthNotConfiguredError if the SSM params haven't been populated
 * yet — that case translates to 503 (not 401) so the client can tell
 * "auth gate is up and rejecting me" from "auth gate isn't deployed".
 */
export async function requireAdmin(
  event: APIGatewayProxyEventV2,
): Promise<AdminIdentity> {
  // API GW v2 normalises header names to lowercase, but defensively check both.
  const headers = event.headers ?? {};
  const jwt =
    headers['cf-access-jwt-assertion'] ??
    headers['Cf-Access-Jwt-Assertion'] ??
    undefined;
  if (typeof jwt !== 'string' || jwt.length === 0) {
    throw new UnauthorizedError('missing Cf-Access-Jwt-Assertion header');
  }

  const config = await loadConfig();
  const jwks = getJwks(config);

  let payload: JWTPayload;
  try {
    const result = await jwtVerify(jwt, jwks, {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: ['RS256'],
    });
    payload = result.payload;
  } catch (err) {
    // Don't leak jose's specific failure reason to the client — keep the
    // attacker guessing whether sig, exp, aud, or iss was off.
    console.warn('CF Access JWT verify failed', { err: (err as Error).message });
    throw new UnauthorizedError('invalid token');
  }

  const email = payload.email;
  if (typeof email !== 'string' || email.toLowerCase() !== config.ownerEmail.toLowerCase()) {
    console.warn('CF Access JWT email not allowlisted', { received: email });
    throw new UnauthorizedError('email not allowed');
  }

  return { email };
}
