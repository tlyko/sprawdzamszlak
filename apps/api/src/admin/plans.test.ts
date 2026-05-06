// Tests for the planner CRUD handlers (ADR-008 PR 4 — first owner-write
// surface in the system, gated by CF Access).
//
// Mocks ddb at the clients.js boundary and requireAdmin at the auth
// boundary. The Strava webhook + cf-access tests cover those paths
// independently; here we only verify plans-specific logic:
//   - GET: scan pagination, malformed-row drop, sort-by-updated_at-desc
//   - POST: validation, default status, sparse field handling, returns 201
//   - PATCH: sparse update expression, 404 on missing id, body validation
//   - DELETE: 204 on success, 404 on missing id
//   - 400 on bad JSON across write endpoints

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

const ddbSendMock = vi.fn();

vi.mock('../clients.js', () => ({
  ddb: { send: (...args: unknown[]) => ddbSendMock(...args) },
  envOrThrow: (name: string) => {
    if (name === 'PLANS_TABLE') return 'sprawdzamszlak-plans-test';
    throw new Error(`unexpected env var: ${name}`);
  },
}));

// requireAdmin is independently tested in auth/cf-access.test.ts. Stub
// it here to a no-op so the plans tests don't have to construct valid
// JWTs for every CRUD case.
vi.mock('../auth/cf-access.js', () => ({
  requireAdmin: vi.fn().mockResolvedValue({ email: 'owner@example.com' }),
  UnauthorizedError: class UnauthorizedError extends Error {},
  AuthNotConfiguredError: class AuthNotConfiguredError extends Error {},
}));

interface BuildEventOpts {
  body?: unknown;
  rawBody?: string;
  isBase64Encoded?: boolean;
  pathParameters?: Record<string, string>;
}

function makeEvent({
  body,
  rawBody,
  isBase64Encoded = false,
  pathParameters,
}: BuildEventOpts = {}): APIGatewayProxyEventV2 {
  return {
    body: rawBody !== undefined ? rawBody : body === undefined ? null : JSON.stringify(body),
    isBase64Encoded,
    pathParameters: pathParameters ?? null,
    headers: {},
    queryStringParameters: null,
  } as unknown as APIGatewayProxyEventV2;
}

function readBody(result: APIGatewayProxyResultV2): unknown {
  if (typeof result === 'string') return result;
  return JSON.parse((result as { body: string }).body);
}

beforeEach(() => {
  vi.resetModules();
  ddbSendMock.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('handleListPlans', () => {
  it('scans + paginates DDB and returns plans sorted by updated_at desc', async () => {
    const { handleListPlans } = await import('./plans.js');
    const olderPlan = {
      id: '11111111-1111-1111-1111-111111111111',
      peak_slug: 'rysy',
      target_year: 2024,
      status: 'planned',
      created_at: 1_700_000_000,
      updated_at: 1_700_000_000,
    };
    const newerPlan = {
      id: '22222222-2222-2222-2222-222222222222',
      peak_slug: 'krywan',
      target_year: 2025,
      status: 'done',
      created_at: 1_700_000_500,
      updated_at: 1_750_000_000,
    };
    ddbSendMock
      .mockResolvedValueOnce({
        Items: [olderPlan],
        LastEvaluatedKey: { id: olderPlan.id },
      })
      .mockResolvedValueOnce({ Items: [newerPlan] });

    const result = await handleListPlans();
    expect(result).toMatchObject({ statusCode: 200 });
    const body = readBody(result) as Array<{ id: string }>;
    expect(body.map((p) => p.id)).toEqual([newerPlan.id, olderPlan.id]);
    expect(ddbSendMock).toHaveBeenCalledTimes(2);
  });

  it('drops malformed rows and keeps the rest of the list', async () => {
    const { handleListPlans } = await import('./plans.js');
    const goodPlan = {
      id: '33333333-3333-3333-3333-333333333333',
      peak_slug: 'gerlach',
      target_year: 2025,
      status: 'planned',
      created_at: 1_700_000_000,
      updated_at: 1_700_000_000,
    };
    ddbSendMock.mockResolvedValueOnce({
      Items: [{ id: 'not-a-uuid', peak_slug: 'broken' }, goodPlan],
    });
    const result = await handleListPlans();
    const body = readBody(result) as Array<{ id: string }>;
    expect(body).toHaveLength(1);
    expect(body[0]?.id).toBe(goodPlan.id);
  });

  it('returns an empty array when the table is empty', async () => {
    const { handleListPlans } = await import('./plans.js');
    ddbSendMock.mockResolvedValueOnce({});
    const result = await handleListPlans();
    expect(readBody(result)).toEqual([]);
  });
});

describe('handleCreatePlan', () => {
  const validInput = {
    peak_slug: 'rysy',
    target_year: 2025,
    target_month: 7,
    route_idea: 'granią od północy',
  };

  it('writes a plan and returns 201 with the created row', async () => {
    const { handleCreatePlan } = await import('./plans.js');
    ddbSendMock.mockResolvedValue({});
    const result = await handleCreatePlan(makeEvent({ body: validInput }));
    expect(result).toMatchObject({ statusCode: 201 });
    const body = readBody(result) as Record<string, unknown>;
    expect(body).toMatchObject({
      peak_slug: 'rysy',
      target_year: 2025,
      target_month: 7,
      route_idea: 'granią od północy',
      status: 'planned',
    });
    expect(typeof body.id).toBe('string');
    expect(typeof body.created_at).toBe('number');
    expect(body.created_at).toBe(body.updated_at);
  });

  it('defaults status to "planned" when not provided', async () => {
    const { handleCreatePlan } = await import('./plans.js');
    ddbSendMock.mockResolvedValue({});
    const result = await handleCreatePlan(makeEvent({ body: validInput }));
    expect(readBody(result)).toMatchObject({ status: 'planned' });
  });

  it('omits sparse fields from the persisted row when not provided', async () => {
    const { handleCreatePlan } = await import('./plans.js');
    ddbSendMock.mockResolvedValue({});
    await handleCreatePlan(
      makeEvent({ body: { peak_slug: 'rysy', target_year: 2025 } }),
    );
    const sent = ddbSendMock.mock.calls[0]?.[0] as {
      input: { Item: Record<string, unknown> };
    };
    expect(sent.input.Item).not.toHaveProperty('target_month');
    expect(sent.input.Item).not.toHaveProperty('route_idea');
    expect(sent.input.Item).not.toHaveProperty('notes');
    expect(sent.input.Item).not.toHaveProperty('strava_id');
  });

  it('returns 400 on invalid JSON body', async () => {
    const { handleCreatePlan } = await import('./plans.js');
    const result = await handleCreatePlan(
      makeEvent({ rawBody: '{not-json' }),
    );
    expect(result).toMatchObject({ statusCode: 400 });
    expect(ddbSendMock).not.toHaveBeenCalled();
  });

  it('returns 400 with zod issues when validation fails', async () => {
    const { handleCreatePlan } = await import('./plans.js');
    const result = await handleCreatePlan(
      makeEvent({ body: { peak_slug: '', target_year: 99 } }),
    );
    expect(result).toMatchObject({ statusCode: 400 });
    const body = readBody(result) as { issues: unknown[] };
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues.length).toBeGreaterThan(0);
    expect(ddbSendMock).not.toHaveBeenCalled();
  });
});

describe('handleUpdatePlan', () => {
  const planId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  function refreshedRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: planId,
      peak_slug: 'rysy',
      target_year: 2025,
      status: 'planned',
      created_at: 1_700_000_000,
      updated_at: 1_750_000_000,
      ...overrides,
    };
  }

  it('builds a sparse update expression and returns the refreshed row', async () => {
    const { handleUpdatePlan } = await import('./plans.js');
    ddbSendMock.mockResolvedValue({
      Attributes: refreshedRow({ status: 'done' }),
    });
    const result = await handleUpdatePlan(
      makeEvent({
        pathParameters: { id: planId },
        body: { status: 'done' },
      }),
    );
    expect(result).toMatchObject({ statusCode: 200 });
    expect(readBody(result)).toMatchObject({ status: 'done' });

    const sent = ddbSendMock.mock.calls[0]?.[0] as {
      input: {
        UpdateExpression: string;
        ExpressionAttributeNames: Record<string, string>;
        ConditionExpression: string;
      };
    };
    expect(sent.input.UpdateExpression).toContain('#status = :status');
    expect(sent.input.UpdateExpression).toContain('#u = :u');
    // Sparse: peak_slug not touched on a status-only update
    expect(sent.input.ExpressionAttributeNames).not.toHaveProperty('#peak_slug');
    expect(sent.input.ConditionExpression).toBe('attribute_exists(id)');
  });

  it('returns 404 on ConditionalCheckFailedException', async () => {
    const { handleUpdatePlan } = await import('./plans.js');
    const cfErr = Object.assign(new Error('not found'), {
      name: 'ConditionalCheckFailedException',
    });
    ddbSendMock.mockRejectedValueOnce(cfErr);
    const result = await handleUpdatePlan(
      makeEvent({
        pathParameters: { id: planId },
        body: { status: 'done' },
      }),
    );
    expect(result).toMatchObject({ statusCode: 404 });
  });

  it('returns 400 when the id path param is missing', async () => {
    const { handleUpdatePlan } = await import('./plans.js');
    const result = await handleUpdatePlan(
      makeEvent({ body: { status: 'done' } }),
    );
    expect(result).toMatchObject({ statusCode: 400 });
    expect(ddbSendMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the body has no fields (PlanUpdateInput requires ≥ 1)', async () => {
    const { handleUpdatePlan } = await import('./plans.js');
    const result = await handleUpdatePlan(
      makeEvent({
        pathParameters: { id: planId },
        body: {},
      }),
    );
    expect(result).toMatchObject({ statusCode: 400 });
    expect(ddbSendMock).not.toHaveBeenCalled();
  });

  it('returns 500 when DDB returns a row that fails re-validation', async () => {
    const { handleUpdatePlan } = await import('./plans.js');
    // Echo back a row missing required fields so PlanSchema.safeParse fails.
    ddbSendMock.mockResolvedValue({
      Attributes: { id: planId, peak_slug: 'rysy' },
    });
    const result = await handleUpdatePlan(
      makeEvent({
        pathParameters: { id: planId },
        body: { status: 'done' },
      }),
    );
    expect(result).toMatchObject({ statusCode: 500 });
  });
});

describe('handleDeletePlan', () => {
  const planId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  it('returns 204 on successful delete', async () => {
    const { handleDeletePlan } = await import('./plans.js');
    ddbSendMock.mockResolvedValue({});
    const result = await handleDeletePlan(
      makeEvent({ pathParameters: { id: planId } }),
    );
    expect(result).toMatchObject({ statusCode: 204 });
  });

  it('returns 404 on ConditionalCheckFailedException', async () => {
    const { handleDeletePlan } = await import('./plans.js');
    const cfErr = Object.assign(new Error('not found'), {
      name: 'ConditionalCheckFailedException',
    });
    ddbSendMock.mockRejectedValueOnce(cfErr);
    const result = await handleDeletePlan(
      makeEvent({ pathParameters: { id: planId } }),
    );
    expect(result).toMatchObject({ statusCode: 404 });
  });

  it('returns 400 when id path param is missing', async () => {
    const { handleDeletePlan } = await import('./plans.js');
    const result = await handleDeletePlan(makeEvent());
    expect(result).toMatchObject({ statusCode: 400 });
    expect(ddbSendMock).not.toHaveBeenCalled();
  });
});
