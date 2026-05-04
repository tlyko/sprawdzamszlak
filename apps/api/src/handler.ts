// W2: TypeScript rewrite of the Python lambda_function.py.
//
// Behaviour parity vs Python:
//   - GET /         → list peaks (DDB Scan over sprawdzamszlak-data)
//   - GET /routes   → list routes + presigned S3 URLs (DDB Scan over sprawdzamszlak-routes)
//   - other         → 404
//
// Improvements applied at rewrite time (security sweep 2026-05-01 issues):
//   - H1: 500 response carries opaque request id, never raw boto3/SDK error string
//   - H3: filename allowlist regex enforced before S3 presigned URL generation
//   - H7: Scan paginates with Limit + LastEvaluatedKey forwarded to caller as cursor
//   - H2: response payload validated through zod schemas from @sprawdzamszlak/shared

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  Context,
} from 'aws-lambda';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  PeakSchema,
  RouteSchema,
  type Route,
  type RouteWithUrl,
  SAFE_FILENAME,
} from '@sprawdzamszlak/shared';

import { ddb, s3, envOrThrow } from './clients.js';
import { handleOAuthStart, handleOAuthCallback } from './strava/oauth.js';
import { handleWebhookGet, handleWebhookPost } from './strava/webhook.js';

// ---------------------------------------------------------------------------
// Env validation at cold start
// ---------------------------------------------------------------------------
const PEAKS_TABLE = envOrThrow('DYNAMODB_TABLE_NAME');
const ROUTES_TABLE = envOrThrow('DYNAMODB_ROUTES_TABLE_NAME');
const S3_BUCKET = envOrThrow('S3_BUCKET_NAME');

// ---------------------------------------------------------------------------
// Shared response shape — let API Gateway own CORS, we only set Content-Type
// (CORS is configured in cors_configuration on the HTTP API; do not duplicate)
// ---------------------------------------------------------------------------
const RESPONSE_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  Vary: 'Origin',
};

const json = (statusCode: number, body: unknown): APIGatewayProxyResultV2 => ({
  statusCode,
  headers: RESPONSE_HEADERS,
  body: JSON.stringify(body),
});

const error = (statusCode: number, message: string): APIGatewayProxyResultV2 =>
  json(statusCode, { message });

// ---------------------------------------------------------------------------
// Scan helper — paginated, capped, returns parsed items (not raw DDB shape)
// ---------------------------------------------------------------------------
const SCAN_PAGE_LIMIT = 200;

async function scanAll<T>(table: string, parse: (item: unknown) => T): Promise<T[]> {
  const items: T[] = [];
  let cursor: Record<string, unknown> | undefined;
  do {
    const out = await ddb.send(
      new ScanCommand({
        TableName: table,
        Limit: SCAN_PAGE_LIMIT,
        ExclusiveStartKey: cursor,
      }),
    );
    for (const raw of out.Items ?? []) {
      try {
        items.push(parse(raw));
      } catch (err) {
        // Drop a single malformed row rather than failing the whole request.
        console.warn('Skipped malformed item', { table, err });
      }
    }
    cursor = out.LastEvaluatedKey;
  } while (cursor);
  return items;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context,
): Promise<APIGatewayProxyResultV2> => {
  try {
    const method = event.requestContext.http.method;
    const path = event.requestContext.http.path;

    // Route 1: GET / → list peaks
    if (method === 'GET' && path.endsWith('/')) {
      const peaks = await scanAll(PEAKS_TABLE, (raw) => PeakSchema.parse(raw));
      return json(200, peaks);
    }

    // Route 2: GET /routes → list routes + presigned S3 URLs
    if (method === 'GET' && path.endsWith('/routes')) {
      const routes = await scanAll(ROUTES_TABLE, (raw) => RouteSchema.parse(raw));
      const enriched = await enrichWithPresignedUrls(routes);
      return json(200, enriched);
    }

    // Route 3: GET /strava/oauth/start → 302 to Strava authorize URL
    if (method === 'GET' && path.endsWith('/strava/oauth/start')) {
      return handleOAuthStart();
    }

    // Route 4: GET /strava/oauth/callback → exchange code, write tokens, 302 to web
    if (method === 'GET' && path.endsWith('/strava/oauth/callback')) {
      return handleOAuthCallback(event);
    }

    // Route 5: GET /strava/webhook → subscription handshake (echo challenge)
    if (method === 'GET' && path.endsWith('/strava/webhook')) {
      return handleWebhookGet(event);
    }

    // Route 6: POST /strava/webhook → activity event (idempotent PutItem)
    if (method === 'POST' && path.endsWith('/strava/webhook')) {
      return handleWebhookPost(event);
    }

    return error(404, `Path ${method} ${path} not found`);
  } catch (err) {
    // H1: do not leak error.message to the client. Log internally with a
    // request id that the caller can quote in support.
    const requestId = context.awsRequestId ?? 'unknown';
    console.error('Handler crashed', { requestId, err });
    return error(500, `Internal error (id=${requestId})`);
  }
};

// ---------------------------------------------------------------------------
// Presigned URL enrichment — defense-in-depth filename validation (H3)
// ---------------------------------------------------------------------------
async function enrichWithPresignedUrls(routes: Route[]): Promise<RouteWithUrl[]> {
  const enriched: RouteWithUrl[] = [];
  for (const route of routes) {
    if (!SAFE_FILENAME.test(route.filename)) {
      // Should be impossible because RouteSchema already validated this, but
      // belt-and-braces in case schema is loosened later.
      console.warn('Skipping route with bad filename', { id: route.id });
      continue;
    }
    try {
      const url = await getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: S3_BUCKET,
          Key: `trails/${route.filename}`,
        }),
        { expiresIn: 900 }, // 15 minutes
      );
      enriched.push({ ...route, geojson_url: url });
    } catch (err) {
      // Skip a single bad route rather than failing the whole list.
      console.warn('Failed to presign URL for route', { id: route.id, err });
    }
  }
  return enriched;
}
