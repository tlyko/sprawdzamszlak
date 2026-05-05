// Strava webhook handlers (ADR-003 D2/D3/D4).
//
// GET  /strava/webhook → subscription handshake. Strava POSTs the URL when
//                        we register a subscription; we echo `hub.challenge`
//                        if `hub.verify_token` matches the stored value.
// POST /strava/webhook → activity event. We MUST return 200 within 2 seconds
//                        or Strava marks delivery failed and retries with
//                        backoff up to 24h. Hot path is intentionally tiny:
//                        validate, conditional PutItem, return 200. Heavy
//                        work (fetch streams, write GeoJSON) runs in the
//                        slice-C fetcher Lambda triggered by DDB Streams.

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { GetParameterCommand } from '@aws-sdk/client-ssm';
import { z } from 'zod';
import { ddb, ssm, envOrThrow } from '../clients.js';

const STRAVA_EVENTS_TABLE = envOrThrow('STRAVA_EVENTS_TABLE');

const PARAM_VERIFY_TOKEN = '/sprawdzamszlak/strava/verify_token';
const PARAM_SUBSCRIPTION_ID = '/sprawdzamszlak/strava/subscription_id';
const PARAM_TOKENS = '/sprawdzamszlak/strava/tokens';

// Webhook events expire from the table after 30 days. Strava itself does not
// re-deliver missed events, so this is purely the manual replay window: how
// long after a fetcher failure can the owner re-insert a row to retrigger
// the DDB Stream. 30d covers a vacation + audit cycle. Cost is negligible
// at single-user scale (a few KB per row).
const EVENT_TTL_SECONDS = 30 * 24 * 60 * 60;

// Synthetic subscription id used by `pnpm strava:replay` /
// `pnpm strava:replay-many`. Real Strava subscription_ids are integers
// assigned by Strava's webhook API; the synthetic value lets owner-driven
// replays through identity validation without aliasing a genuine push.
const SYNTHETIC_SUBSCRIPTION_ID = 999999;

let cachedVerifyToken: string | undefined;
let cachedExpectedIdentity: { subscriptionId: number; athleteId: number } | undefined;

async function getVerifyToken(): Promise<string> {
  if (cachedVerifyToken) return cachedVerifyToken;
  const out = await ssm.send(
    new GetParameterCommand({ Name: PARAM_VERIFY_TOKEN, WithDecryption: true }),
  );
  const value = out.Parameter?.Value;
  if (!value) throw new Error(`Missing SSM param ${PARAM_VERIFY_TOKEN}`);
  cachedVerifyToken = value;
  return cachedVerifyToken;
}

// Loads the (subscription_id, athlete_id) pair the webhook expects on every
// genuine event. Both come from SSM. athlete_id is parsed out of the tokens
// SecureString — we never cache the access_token itself in this Lambda, only
// the public id. Cached for the warm-invocation lifetime of the container.
async function getExpectedIdentity(): Promise<{
  subscriptionId: number;
  athleteId: number;
}> {
  if (cachedExpectedIdentity) return cachedExpectedIdentity;
  const [subOut, tokensOut] = await Promise.all([
    ssm.send(new GetParameterCommand({ Name: PARAM_SUBSCRIPTION_ID })),
    ssm.send(new GetParameterCommand({ Name: PARAM_TOKENS, WithDecryption: true })),
  ]);
  const subVal = subOut.Parameter?.Value;
  const tokensVal = tokensOut.Parameter?.Value;
  if (!subVal) throw new Error(`Missing SSM param ${PARAM_SUBSCRIPTION_ID}`);
  if (!tokensVal) throw new Error(`Missing SSM param ${PARAM_TOKENS}`);
  const subscriptionId = Number(subVal);
  if (!Number.isInteger(subscriptionId) || subscriptionId <= 0) {
    throw new Error(`Bad subscription_id in SSM: "${subVal}"`);
  }
  const tokens = JSON.parse(tokensVal) as { athlete_id?: unknown };
  if (typeof tokens.athlete_id !== 'number' || tokens.athlete_id <= 0) {
    throw new Error(`Missing/invalid athlete_id in ${PARAM_TOKENS}`);
  }
  cachedExpectedIdentity = { subscriptionId, athleteId: tokens.athlete_id };
  return cachedExpectedIdentity;
}

const StravaWebhookEventSchema = z.object({
  object_type: z.string(),
  object_id: z.number().int().positive(),
  aspect_type: z.enum(['create', 'update', 'delete']),
  owner_id: z.number().int().positive(),
  subscription_id: z.number().int().positive(),
  event_time: z.number().int().positive(),
  updates: z.record(z.string(), z.unknown()).optional(),
});

// ---------------------------------------------------------------------------
// GET /strava/webhook?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…
// ---------------------------------------------------------------------------
export async function handleWebhookGet(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const params = event.queryStringParameters ?? {};
  const mode = params['hub.mode'];
  const token = params['hub.verify_token'];
  const challenge = params['hub.challenge'];

  if (mode !== 'subscribe' || !token || !challenge) {
    return { statusCode: 400, body: 'bad request' };
  }

  const expected = await getVerifyToken();
  if (token !== expected) {
    console.warn('Strava webhook handshake: bad verify_token');
    return { statusCode: 403, body: 'forbidden' };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 'hub.challenge': challenge }),
  };
}

// ---------------------------------------------------------------------------
// POST /strava/webhook (activity event)
// ---------------------------------------------------------------------------
export async function handleWebhookPost(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  let bodyStr = event.body ?? '';
  if (event.isBase64Encoded) {
    bodyStr = Buffer.from(bodyStr, 'base64').toString('utf-8');
  }

  let parsed: z.infer<typeof StravaWebhookEventSchema>;
  try {
    parsed = StravaWebhookEventSchema.parse(JSON.parse(bodyStr));
  } catch (err) {
    console.warn('Strava webhook: malformed body', { err });
    // Returning 200 even on malformed payloads — we don't want Strava to
    // retry obviously broken events. Real Strava events always parse.
    return { statusCode: 200, body: '' };
  }

  // Reject events that don't belong to our subscription / our athlete.
  // Strava webhook does not sign payloads, so the endpoint is otherwise
  // open: anyone can POST a syntactically valid event and trigger fetcher
  // invocations until Strava 404s on the unknown id (= DoS surface).
  // Replay tooling (`pnpm strava:replay*`) goes through the same path
  // using SYNTHETIC_SUBSCRIPTION_ID + the owner's real athlete_id, so we
  // allowlist that pair too.
  try {
    const expected = await getExpectedIdentity();
    const subscriptionOk =
      parsed.subscription_id === expected.subscriptionId ||
      parsed.subscription_id === SYNTHETIC_SUBSCRIPTION_ID;
    const ownerOk = parsed.owner_id === expected.athleteId;
    if (!subscriptionOk || !ownerOk) {
      console.warn('Strava webhook: identity mismatch — dropping', {
        receivedSub: parsed.subscription_id,
        receivedOwner: parsed.owner_id,
        subscriptionOk,
        ownerOk,
      });
      // 200 not 403 — denies attacker any oracle on which side mismatched
      // and prevents Strava-style retries if a genuine event ever leaks
      // through with a stale cached id during a re-subscribe race.
      return { statusCode: 200, body: '' };
    }
  } catch (err) {
    // SSM read failed (transient, or owner hasn't completed subscribe/OAuth
    // yet). Log loudly; return 200 so we don't burn Strava's retry budget
    // on infra problems we can't fix from inside the request.
    console.error('Strava webhook: identity load failed — dropping event', { err });
    return { statusCode: 200, body: '' };
  }

  // Idempotency key per ADR-003 D3.
  const eventId = `${parsed.subscription_id}#${parsed.object_id}#${parsed.event_time}`;

  try {
    await ddb.send(
      new PutCommand({
        TableName: STRAVA_EVENTS_TABLE,
        Item: {
          event_id: eventId,
          object_type: parsed.object_type,
          object_id: parsed.object_id,
          aspect_type: parsed.aspect_type,
          owner_id: parsed.owner_id,
          subscription_id: parsed.subscription_id,
          event_time: parsed.event_time,
          updates: parsed.updates ?? {},
          received_at: Math.floor(Date.now() / 1000),
          expires_at: parsed.event_time + EVENT_TTL_SECONDS,
        },
        ConditionExpression: 'attribute_not_exists(event_id)',
      }),
    );
  } catch (err) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      console.info('Strava webhook: duplicate event ignored', { eventId });
      return { statusCode: 200, body: '' };
    }
    // Any other DDB failure: log loudly but still 200 — Strava's retry won't
    // help us if the table is unavailable, and a 5xx burns our retry budget.
    // The event is lost; re-subscription history makes manual replay possible.
    console.error('Strava webhook: DDB write failed', { eventId, err });
    return { statusCode: 200, body: '' };
  }

  return { statusCode: 200, body: '' };
}
