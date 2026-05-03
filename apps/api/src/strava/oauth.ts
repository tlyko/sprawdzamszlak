// Strava OAuth handlers (ADR-007).
//
// /strava/oauth/start    → mint CSRF state, 302 to Strava authorize URL.
// /strava/oauth/callback → validate state, exchange code, store tokens, 302 to web.
//
// SSM-stored Strava app credentials are fetched lazily and cached at module
// scope after first successful read (warm invocations skip the SSM round-trip).
// Tokens land in /sprawdzamszlak/strava/tokens as a SecureString JSON blob.

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomBytes } from 'node:crypto';
import { PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { GetParametersCommand, PutParameterCommand } from '@aws-sdk/client-ssm';
import { StravaTokensSchema, type StravaTokens } from '@sprawdzamszlak/shared';
import { ddb, ssm, envOrThrow } from '../clients.js';

const OAUTH_STATES_TABLE = envOrThrow('OAUTH_STATES_TABLE');
const STRAVA_REDIRECT_URI = envOrThrow('STRAVA_REDIRECT_URI');
const WEB_BASE_URL = envOrThrow('WEB_BASE_URL');

const STATE_TTL_SECONDS = 600; // 10 min, ADR-007

const PARAM_CLIENT_ID = '/sprawdzamszlak/strava/client_id';
const PARAM_CLIENT_SECRET = '/sprawdzamszlak/strava/client_secret';
const PARAM_TOKENS = '/sprawdzamszlak/strava/tokens';

let cachedAppCreds: { clientId: string; clientSecret: string } | undefined;

async function getAppCreds(): Promise<{ clientId: string; clientSecret: string }> {
  if (cachedAppCreds) return cachedAppCreds;
  const out = await ssm.send(
    new GetParametersCommand({
      Names: [PARAM_CLIENT_ID, PARAM_CLIENT_SECRET],
      WithDecryption: true,
    }),
  );
  const byName = new Map((out.Parameters ?? []).map((p) => [p.Name, p.Value]));
  const clientId = byName.get(PARAM_CLIENT_ID);
  const clientSecret = byName.get(PARAM_CLIENT_SECRET);
  if (!clientId || !clientSecret) {
    throw new Error(
      `Missing Strava credentials in Parameter Store. Run: aws ssm put-parameter --name ${PARAM_CLIENT_ID} --type String ...`,
    );
  }
  cachedAppCreds = { clientId, clientSecret };
  return cachedAppCreds;
}

function redirectTo(location: string): APIGatewayProxyResultV2 {
  return { statusCode: 302, headers: { Location: location } };
}

function redirectToWeb(status: 'ok' | 'error', reason?: string): APIGatewayProxyResultV2 {
  const params = new URLSearchParams({ status });
  if (reason) params.set('reason', reason);
  return redirectTo(`${WEB_BASE_URL}/strava/connected?${params.toString()}`);
}

// ---------------------------------------------------------------------------
// GET /strava/oauth/start
// ---------------------------------------------------------------------------
export async function handleOAuthStart(): Promise<APIGatewayProxyResultV2> {
  const { clientId } = await getAppCreds();

  const state = randomBytes(32).toString('base64url');
  const now = Math.floor(Date.now() / 1000);

  await ddb.send(
    new PutCommand({
      TableName: OAUTH_STATES_TABLE,
      Item: { state, expires_at: now + STATE_TTL_SECONDS },
    }),
  );

  const authorize = new URL('https://www.strava.com/oauth/authorize');
  authorize.searchParams.set('client_id', clientId);
  authorize.searchParams.set('redirect_uri', STRAVA_REDIRECT_URI);
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('approval_prompt', 'auto');
  authorize.searchParams.set('scope', 'read,activity:read_all');
  authorize.searchParams.set('state', state);

  return redirectTo(authorize.toString());
}

// ---------------------------------------------------------------------------
// GET /strava/oauth/callback?code=…&state=…
// ---------------------------------------------------------------------------
export async function handleOAuthCallback(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const code = event.queryStringParameters?.code;
  const state = event.queryStringParameters?.state;
  const stravaError = event.queryStringParameters?.error;

  if (stravaError) return redirectToWeb('error', `strava_${stravaError}`);
  if (!code || !state) return redirectToWeb('error', 'missing_params');

  // Conditional delete consumes the nonce atomically; second use returns
  // ConditionalCheckFailed and is rejected.
  let deleted: { state: string; expires_at?: number } | undefined;
  try {
    const out = await ddb.send(
      new DeleteCommand({
        TableName: OAUTH_STATES_TABLE,
        Key: { state },
        ConditionExpression: 'attribute_exists(#s)',
        ExpressionAttributeNames: { '#s': 'state' },
        ReturnValues: 'ALL_OLD',
      }),
    );
    deleted = out.Attributes as { state: string; expires_at?: number } | undefined;
  } catch (err) {
    // ConditionalCheckFailedException — state wasn't there or already used.
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      return redirectToWeb('error', 'invalid_state');
    }
    throw err;
  }

  // DDB TTL is best-effort (sweep within ~48h, not exact). Belt-and-braces:
  // reject if expires_at is in the past.
  const now = Math.floor(Date.now() / 1000);
  if (!deleted?.expires_at || deleted.expires_at < now) {
    return redirectToWeb('error', 'expired_state');
  }

  const { clientId, clientSecret } = await getAppCreds();
  const tokenResp = await fetch('https://www.strava.com/api/v3/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenResp.ok) {
    console.error('Strava token exchange failed', {
      status: tokenResp.status,
      body: await tokenResp.text().catch(() => '<unreadable>'),
    });
    return redirectToWeb('error', 'token_exchange_failed');
  }

  const raw = (await tokenResp.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
    athlete?: { id?: number };
  };

  const parsed = StravaTokensSchema.safeParse({
    access_token: raw.access_token,
    refresh_token: raw.refresh_token,
    expires_at: raw.expires_at,
    athlete_id: raw.athlete?.id,
  });
  if (!parsed.success) {
    console.error('Strava token response failed validation', { issues: parsed.error.issues });
    return redirectToWeb('error', 'invalid_token_response');
  }
  const tokens: StravaTokens = parsed.data;

  await ssm.send(
    new PutParameterCommand({
      Name: PARAM_TOKENS,
      Type: 'SecureString',
      Value: JSON.stringify(tokens),
      Overwrite: true,
    }),
  );

  return redirectToWeb('ok');
}
