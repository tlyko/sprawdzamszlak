// Plans CRUD (ADR-008 PR 4).
//
//   GET    /plans                 (public — kronika is public)
//   POST   /admin/plans           (CF Access JWT required)
//   PATCH  /admin/plans/{id}      (CF Access JWT required)
//   DELETE /admin/plans/{id}      (CF Access JWT required)
//
// Storage: DDB table sprawdzamszlak-plans, hash key `id` (uuid v4 minted
// server-side). All write paths run requireAdmin first; failures bubble
// as UnauthorizedError / AuthNotConfiguredError caught by handler.ts.
//
// Data integrity:
//   - Body is zod-parsed (PlanCreateInputSchema / PlanUpdateInputSchema)
//     before touching DDB. Bad payload → 400, full row never persists.
//   - PATCH builds a sparse UpdateExpression so only provided fields
//     change; updated_at is always stamped.
//   - DELETE uses ConditionExpression to return 404 when id missing.
//   - Single-user scale (≤ ~50 rows) → Scan for GET, no GSI.

import { randomUUID } from 'node:crypto';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import {
  DeleteCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  PlanCreateInputSchema,
  PlanSchema,
  PlanUpdateInputSchema,
  type Plan,
  type PlanUpdateInput,
} from '@sprawdzamszlak/shared';
import { ddb, envOrThrow } from '../clients.js';
import { requireAdmin } from '../auth/cf-access.js';

const PLANS_TABLE = envOrThrow('PLANS_TABLE');

const json = (statusCode: number, body: unknown): APIGatewayProxyResultV2 => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const error = (statusCode: number, message: string): APIGatewayProxyResultV2 =>
  json(statusCode, { message });

function parseBody(event: APIGatewayProxyEventV2): unknown {
  const raw = event.body ?? '';
  const decoded = event.isBase64Encoded
    ? Buffer.from(raw, 'base64').toString('utf-8')
    : raw;
  if (decoded.length === 0) return {};
  try {
    return JSON.parse(decoded);
  } catch {
    return Symbol.for('plans.bad_json');
  }
}

// ---------------------------------------------------------------------------
// GET /plans — list everything (public)
// ---------------------------------------------------------------------------
export async function handleListPlans(): Promise<APIGatewayProxyResultV2> {
  const items: Plan[] = [];
  let cursor: Record<string, unknown> | undefined;
  do {
    const out = await ddb.send(
      new ScanCommand({
        TableName: PLANS_TABLE,
        Limit: 200,
        ExclusiveStartKey: cursor,
      }),
    );
    for (const raw of out.Items ?? []) {
      const parsed = PlanSchema.safeParse(raw);
      if (parsed.success) {
        items.push(parsed.data);
      } else {
        // Drop malformed rows rather than failing the whole list — a
        // single bad migration shouldn't take the public list down.
        console.warn('Skipped malformed plan', { issues: parsed.error.issues });
      }
    }
    cursor = out.LastEvaluatedKey;
  } while (cursor);

  // Stable order: most recently updated first. Owner sees fresh edits at
  // the top; long-tail past plans drop down.
  items.sort((a, b) => b.updated_at - a.updated_at);
  return json(200, items);
}

// ---------------------------------------------------------------------------
// POST /admin/plans — create (admin)
// ---------------------------------------------------------------------------
export async function handleCreatePlan(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  await requireAdmin(event);

  const raw = parseBody(event);
  if (raw === Symbol.for('plans.bad_json')) {
    return error(400, 'invalid JSON body');
  }

  const parsed = PlanCreateInputSchema.safeParse(raw);
  if (!parsed.success) {
    return json(400, { message: 'validation failed', issues: parsed.error.issues });
  }

  const now = Math.floor(Date.now() / 1000);
  const plan: Plan = {
    id: randomUUID(),
    peak_slug: parsed.data.peak_slug,
    target_year: parsed.data.target_year,
    ...(parsed.data.target_month !== undefined
      ? { target_month: parsed.data.target_month }
      : {}),
    status: parsed.data.status ?? 'planned',
    ...(parsed.data.route_idea !== undefined
      ? { route_idea: parsed.data.route_idea }
      : {}),
    ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
    ...(parsed.data.strava_id !== undefined
      ? { strava_id: parsed.data.strava_id }
      : {}),
    created_at: now,
    updated_at: now,
  };

  await ddb.send(
    new PutCommand({
      TableName: PLANS_TABLE,
      Item: plan,
      // randomUUID collisions are negligible but the conditional makes
      // the contract explicit: this endpoint never silently overwrites.
      ConditionExpression: 'attribute_not_exists(id)',
    }),
  );

  return json(201, plan);
}

// ---------------------------------------------------------------------------
// PATCH /admin/plans/{id} — partial update (admin)
// ---------------------------------------------------------------------------
export async function handleUpdatePlan(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  await requireAdmin(event);

  const id = event.pathParameters?.id;
  if (!id) return error(400, 'missing id');

  const raw = parseBody(event);
  if (raw === Symbol.for('plans.bad_json')) {
    return error(400, 'invalid JSON body');
  }

  const parsed = PlanUpdateInputSchema.safeParse(raw);
  if (!parsed.success) {
    return json(400, { message: 'validation failed', issues: parsed.error.issues });
  }

  // Build a sparse UpdateExpression. updated_at is always set; provided
  // fields are SET; absent fields are untouched.
  const sets: string[] = ['#u = :u'];
  const removes: string[] = [];
  const names: Record<string, string> = { '#u': 'updated_at' };
  const values: Record<string, unknown> = { ':u': Math.floor(Date.now() / 1000) };

  const fields: Array<keyof PlanUpdateInput> = [
    'peak_slug',
    'target_year',
    'target_month',
    'status',
    'route_idea',
    'notes',
    'strava_id',
  ];
  for (const field of fields) {
    const value = parsed.data[field];
    if (value === undefined) continue;
    const nameKey = `#${field}`;
    const valueKey = `:${field}`;
    names[nameKey] = field;
    values[valueKey] = value;
    sets.push(`${nameKey} = ${valueKey}`);
  }

  let expr = `SET ${sets.join(', ')}`;
  if (removes.length > 0) expr += ` REMOVE ${removes.join(', ')}`;

  try {
    const out = await ddb.send(
      new UpdateCommand({
        TableName: PLANS_TABLE,
        Key: { id },
        UpdateExpression: expr,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        // Reject silently-creating-a-new-row if the id doesn't exist.
        ConditionExpression: 'attribute_exists(id)',
        ReturnValues: 'ALL_NEW',
      }),
    );

    const refreshed = PlanSchema.safeParse(out.Attributes);
    if (!refreshed.success) {
      console.error('Updated plan failed re-validation', {
        id,
        issues: refreshed.error.issues,
      });
      return error(500, 'updated row is malformed');
    }
    return json(200, refreshed.data);
  } catch (err) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      return error(404, 'plan not found');
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// DELETE /admin/plans/{id} — hard delete (admin)
// ---------------------------------------------------------------------------
export async function handleDeletePlan(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  await requireAdmin(event);

  const id = event.pathParameters?.id;
  if (!id) return error(400, 'missing id');

  try {
    await ddb.send(
      new DeleteCommand({
        TableName: PLANS_TABLE,
        Key: { id },
        ConditionExpression: 'attribute_exists(id)',
      }),
    );
    return { statusCode: 204, body: '' };
  } catch (err) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      return error(404, 'plan not found');
    }
    throw err;
  }
}
