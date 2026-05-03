// Lambda entry point. Routes:
//   GET  /            → list peaks
//   GET  /routes      → list routes + presigned S3 URLs
//   POST /admin/upload → admin GPX upload (basic auth required)
//
// Behaviour parity with W2 + new admin route added in W3.

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  Context,
} from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  PeakSchema,
  RouteSchema,
  type Route,
  type RouteWithUrl,
  SAFE_FILENAME,
} from '@sprawdzamszlak/shared';
import { requireAdmin } from './lib/auth.js';
import { handleAdminUpload } from './routes/admin-upload.js';

function envOrThrow(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

const REGION = envOrThrow('MY_AWS_REGION');
const PEAKS_TABLE = envOrThrow('DYNAMODB_TABLE_NAME');
const ROUTES_TABLE = envOrThrow('DYNAMODB_ROUTES_TABLE_NAME');
const S3_BUCKET = envOrThrow('S3_BUCKET_NAME');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});
const s3 = new S3Client({ region: REGION });

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
        console.warn('Skipped malformed item', { table, err });
      }
    }
    cursor = out.LastEvaluatedKey;
  } while (cursor);
  return items;
}

async function enrichWithPresignedUrls(routes: Route[]): Promise<RouteWithUrl[]> {
  const enriched: RouteWithUrl[] = [];
  for (const route of routes) {
    if (!SAFE_FILENAME.test(route.filename)) {
      console.warn('Skipping route with bad filename', { id: route.id });
      continue;
    }
    try {
      const url = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: S3_BUCKET, Key: `trails/${route.filename}` }),
        { expiresIn: 900 },
      );
      enriched.push({ ...route, geojson_url: url });
    } catch (err) {
      console.warn('Failed to presign URL for route', { id: route.id, err });
    }
  }
  return enriched;
}

export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context,
): Promise<APIGatewayProxyResultV2> => {
  try {
    const method = event.requestContext.http.method;
    const path = event.requestContext.http.path;

    // Public GETs
    if (method === 'GET' && path.endsWith('/')) {
      const peaks = await scanAll(PEAKS_TABLE, (raw) => PeakSchema.parse(raw));
      return json(200, peaks);
    }
    if (method === 'GET' && path.endsWith('/routes')) {
      const routes = await scanAll(ROUTES_TABLE, (raw) => RouteSchema.parse(raw));
      const enriched = await enrichWithPresignedUrls(routes);
      return json(200, enriched);
    }

    // Admin
    if (method === 'POST' && (path.endsWith('/admin/upload') || path.endsWith('/admin/upload/'))) {
      const denied = requireAdmin(event);
      if (denied) return denied;
      return await handleAdminUpload(event);
    }

    return error(404, `Path ${method} ${path} not found`);
  } catch (err) {
    const requestId = context.awsRequestId ?? 'unknown';
    console.error('Handler crashed', { requestId, err });
    return error(500, `Internal error (id=${requestId})`);
  }
};
