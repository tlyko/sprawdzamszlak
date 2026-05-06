// Tests for the Strava webhook handlers — top-of-stack security surface
// (no signature verification on Strava's side, so the identity-match in
// handleWebhookPost is the only thing standing between an attacker and
// fetcher Lambda invocations on arbitrary activity IDs).
//
// Covered:
//   - GET handshake: valid token, wrong token, missing params
//   - POST: happy path, identity mismatch (wrong sub/owner), synthetic
//     subscription allowlist, idempotency dedup (ConditionalCheckFailed),
//     malformed body, SSM read failure
//   - 200 contract: every error path returns 200 (avoid Strava retry storm)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

const VERIFY_TOKEN = 'super-secret-handshake-token';
const SUBSCRIPTION_ID = 555_111;
const ATHLETE_ID = 42_424_242;
const SYNTHETIC_SUBSCRIPTION_ID = 999_999;

const ssmSendMock = vi.fn();
const ddbSendMock = vi.fn();

vi.mock('../clients.js', () => ({
  ssm: { send: (...args: unknown[]) => ssmSendMock(...args) },
  ddb: { send: (...args: unknown[]) => ddbSendMock(...args) },
  envOrThrow: (name: string) => {
    if (name === 'STRAVA_EVENTS_TABLE') return 'sprawdzamszlak-strava-events-test';
    throw new Error(`unexpected env var: ${name}`);
  },
}));

// Default SSM responses: valid verify_token + valid subscription_id +
// tokens with our test athlete_id. Tests override individual params via
// per-test mockResolvedValueOnce as needed.
function mockSsmHappyPath(): void {
  ssmSendMock.mockImplementation(async (cmd: { input: { Name: string } }) => {
    const name = cmd.input.Name;
    switch (name) {
      case '/sprawdzamszlak/strava/verify_token':
        return { Parameter: { Value: VERIFY_TOKEN } };
      case '/sprawdzamszlak/strava/subscription_id':
        return { Parameter: { Value: String(SUBSCRIPTION_ID) } };
      case '/sprawdzamszlak/strava/tokens':
        return {
          Parameter: {
            Value: JSON.stringify({
              access_token: 'access',
              refresh_token: 'refresh',
              expires_at: 9_999_999_999,
              athlete_id: ATHLETE_ID,
            }),
          },
        };
      default:
        throw new Error(`unexpected SSM param: ${name}`);
    }
  });
}

interface BuildEventOpts {
  body?: object;
  query?: Record<string, string>;
}

function makeEvent({ body, query }: BuildEventOpts = {}): APIGatewayProxyEventV2 {
  return {
    body: body === undefined ? null : JSON.stringify(body),
    isBase64Encoded: false,
    queryStringParameters: query ?? null,
    headers: {},
  } as unknown as APIGatewayProxyEventV2;
}

const validEventBody = {
  object_type: 'activity',
  object_id: 1234567890,
  aspect_type: 'create' as const,
  owner_id: ATHLETE_ID,
  subscription_id: SUBSCRIPTION_ID,
  event_time: 1_700_000_000,
};

async function loadModule() {
  vi.resetModules();
  return import('./webhook.js');
}

beforeEach(() => {
  ssmSendMock.mockReset();
  ddbSendMock.mockReset();
  mockSsmHappyPath();
  ddbSendMock.mockResolvedValue({});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('handleWebhookGet — handshake', () => {
  it('echoes the challenge when token matches', async () => {
    const { handleWebhookGet } = await loadModule();
    const result = await handleWebhookGet(
      makeEvent({
        query: {
          'hub.mode': 'subscribe',
          'hub.verify_token': VERIFY_TOKEN,
          'hub.challenge': 'roundtrip-42',
        },
      }),
    );
    expect(result).toMatchObject({
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    expect(JSON.parse((result as { body: string }).body)).toEqual({
      'hub.challenge': 'roundtrip-42',
    });
  });

  it('returns 403 when the verify_token is wrong', async () => {
    const { handleWebhookGet } = await loadModule();
    const result = await handleWebhookGet(
      makeEvent({
        query: {
          'hub.mode': 'subscribe',
          'hub.verify_token': 'wrong',
          'hub.challenge': 'whatever',
        },
      }),
    );
    expect(result).toMatchObject({ statusCode: 403 });
  });

  it('returns 400 when params are missing', async () => {
    const { handleWebhookGet } = await loadModule();
    const result = await handleWebhookGet(
      makeEvent({ query: { 'hub.mode': 'subscribe' } }),
    );
    expect(result).toMatchObject({ statusCode: 400 });
  });

  it('returns 400 when mode is not "subscribe"', async () => {
    const { handleWebhookGet } = await loadModule();
    const result = await handleWebhookGet(
      makeEvent({
        query: {
          'hub.mode': 'unsubscribe',
          'hub.verify_token': VERIFY_TOKEN,
          'hub.challenge': 'x',
        },
      }),
    );
    expect(result).toMatchObject({ statusCode: 400 });
  });
});

describe('handleWebhookPost — happy path', () => {
  it('writes the event to DDB with the composite event_id', async () => {
    const { handleWebhookPost } = await loadModule();
    const result = await handleWebhookPost(makeEvent({ body: validEventBody }));
    expect(result).toMatchObject({ statusCode: 200 });

    expect(ddbSendMock).toHaveBeenCalledOnce();
    const sent = ddbSendMock.mock.calls[0]?.[0] as {
      input: { Item: { event_id: string }; ConditionExpression: string };
    };
    expect(sent.input.Item.event_id).toBe(
      `${SUBSCRIPTION_ID}#${validEventBody.object_id}#${validEventBody.event_time}`,
    );
    expect(sent.input.ConditionExpression).toBe('attribute_not_exists(event_id)');
  });

  it('accepts the synthetic subscription_id (replay tooling)', async () => {
    const { handleWebhookPost } = await loadModule();
    const result = await handleWebhookPost(
      makeEvent({
        body: { ...validEventBody, subscription_id: SYNTHETIC_SUBSCRIPTION_ID },
      }),
    );
    expect(result).toMatchObject({ statusCode: 200 });
    expect(ddbSendMock).toHaveBeenCalledOnce();
  });

  it('decodes a base64-encoded body', async () => {
    const { handleWebhookPost } = await loadModule();
    const json = JSON.stringify(validEventBody);
    const event = {
      body: Buffer.from(json, 'utf-8').toString('base64'),
      isBase64Encoded: true,
      queryStringParameters: null,
      headers: {},
    } as unknown as APIGatewayProxyEventV2;
    const result = await handleWebhookPost(event);
    expect(result).toMatchObject({ statusCode: 200 });
    expect(ddbSendMock).toHaveBeenCalledOnce();
  });
});

describe('handleWebhookPost — idempotency', () => {
  it('returns 200 and skips DDB on duplicate (ConditionalCheckFailedException)', async () => {
    const { handleWebhookPost } = await loadModule();
    ddbSendMock.mockReset();
    const dupErr = Object.assign(new Error('duplicate'), {
      name: 'ConditionalCheckFailedException',
    });
    ddbSendMock.mockRejectedValueOnce(dupErr);

    const result = await handleWebhookPost(makeEvent({ body: validEventBody }));
    expect(result).toMatchObject({ statusCode: 200 });
    expect(ddbSendMock).toHaveBeenCalledOnce();
  });

  it('returns 200 even on unexpected DDB errors (avoid Strava retry storm)', async () => {
    const { handleWebhookPost } = await loadModule();
    ddbSendMock.mockReset();
    ddbSendMock.mockRejectedValueOnce(new Error('throttled'));
    const result = await handleWebhookPost(makeEvent({ body: validEventBody }));
    expect(result).toMatchObject({ statusCode: 200 });
  });
});

describe('handleWebhookPost — identity gate', () => {
  it('drops events with wrong subscription_id (no DDB write)', async () => {
    const { handleWebhookPost } = await loadModule();
    const result = await handleWebhookPost(
      makeEvent({ body: { ...validEventBody, subscription_id: 1 } }),
    );
    expect(result).toMatchObject({ statusCode: 200 });
    expect(ddbSendMock).not.toHaveBeenCalled();
  });

  it('drops events with wrong owner_id (no DDB write)', async () => {
    const { handleWebhookPost } = await loadModule();
    const result = await handleWebhookPost(
      makeEvent({ body: { ...validEventBody, owner_id: 9_999_999 } }),
    );
    expect(result).toMatchObject({ statusCode: 200 });
    expect(ddbSendMock).not.toHaveBeenCalled();
  });

  it('returns 200 when SSM identity load fails (no DDB write, no retry oracle)', async () => {
    const { handleWebhookPost } = await loadModule();
    ssmSendMock.mockReset();
    ssmSendMock.mockRejectedValue(new Error('SSM unavailable'));
    const result = await handleWebhookPost(makeEvent({ body: validEventBody }));
    expect(result).toMatchObject({ statusCode: 200 });
    expect(ddbSendMock).not.toHaveBeenCalled();
  });
});

describe('handleWebhookPost — malformed body', () => {
  it('returns 200 on completely invalid JSON (zod parse fails)', async () => {
    const { handleWebhookPost } = await loadModule();
    const event = {
      body: 'not json at all',
      isBase64Encoded: false,
      queryStringParameters: null,
      headers: {},
    } as unknown as APIGatewayProxyEventV2;
    const result = await handleWebhookPost(event);
    expect(result).toMatchObject({ statusCode: 200 });
    expect(ddbSendMock).not.toHaveBeenCalled();
  });

  it('returns 200 when required fields are missing from a syntactically valid body', async () => {
    const { handleWebhookPost } = await loadModule();
    const result = await handleWebhookPost(
      makeEvent({ body: { aspect_type: 'create' } }),
    );
    expect(result).toMatchObject({ statusCode: 200 });
    expect(ddbSendMock).not.toHaveBeenCalled();
  });

  it('returns 200 when aspect_type is not in the enum', async () => {
    const { handleWebhookPost } = await loadModule();
    const result = await handleWebhookPost(
      makeEvent({
        body: { ...validEventBody, aspect_type: 'something-else' },
      }),
    );
    expect(result).toMatchObject({ statusCode: 200 });
    expect(ddbSendMock).not.toHaveBeenCalled();
  });
});
