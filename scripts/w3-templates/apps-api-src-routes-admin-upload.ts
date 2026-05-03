// POST /admin/upload — multipart GPX upload, converts to GeoJSON, writes
// the GeoJSON to S3 and the metadata row to DynamoDB.
//
// Order of operations is deliberate (per ADR-004 section D7):
//   1. requireAdmin (already done by caller)
//   2. parse multipart
//   3. body size cap (5 MB)
//   4. validate fields with zod
//   5. conditional DDB PutItem with attribute_not_exists(id)  ← claims slug
//   6. parse GPX → GeoJSON
//   7. PUT GeoJSON to S3
//   8. respond 200
// On any failure between 5 and 7, best-effort DDB DeleteItem to roll back.

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { MAX_GPX_BYTES, RouteUploadInputSchema } from '@sprawdzamszlak/shared';
import { parseMultipart } from '../lib/multipart.js';
import { convertGpxToGeoJson } from '../lib/gpx.js';

const REGION = process.env.MY_AWS_REGION ?? 'eu-west-1';
const ROUTES_TABLE = process.env.DYNAMODB_ROUTES_TABLE_NAME ?? '';
const S3_BUCKET = process.env.S3_BUCKET_NAME ?? '';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const s3 = new S3Client({ region: REGION });

const RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
  Vary: 'Origin',
};

const json = (statusCode: number, body: unknown): APIGatewayProxyResultV2 => ({
  statusCode,
  headers: RESPONSE_HEADERS,
  body: JSON.stringify(body),
});

const error = (statusCode: number, message: string) => json(statusCode, { message });

export async function handleAdminUpload(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const contentType =
    event.headers?.['content-type'] ?? event.headers?.['Content-Type'] ?? '';
  if (!contentType.startsWith('multipart/form-data')) {
    return error(400, 'Content-Type must be multipart/form-data');
  }

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body ?? '', 'base64')
    : Buffer.from(event.body ?? '', 'utf-8');
  if (rawBody.length > MAX_GPX_BYTES) {
    return error(413, `Payload exceeds ${MAX_GPX_BYTES} bytes`);
  }

  let parsed;
  try {
    parsed = parseMultipart(rawBody, contentType);
  } catch (err) {
    return error(400, `Bad multipart: ${(err as Error).message}`);
  }

  const { fields, files } = parsed;

  const inputResult = RouteUploadInputSchema.safeParse({
    id: (fields.id ?? '').toLowerCase(),
    name: fields.name ?? '',
    type: fields.type ?? '',
  });
  if (!inputResult.success) {
    return error(400, `Invalid fields: ${inputResult.error.issues.map((i) => i.message).join('; ')}`);
  }
  const input = inputResult.data;

  const gpxFile = files.gpx;
  if (!gpxFile) return error(400, 'Missing "gpx" file field');
  if (gpxFile.data.length === 0) return error(400, 'Empty GPX file');

  const filename = `${input.id}.geojson`;
  const s3Key = `trails/${filename}`;

  // Step 5: claim slug via conditional PutItem
  try {
    await ddb.send(
      new PutCommand({
        TableName: ROUTES_TABLE,
        Item: { id: input.id, name: input.name, type: input.type, filename },
        ConditionExpression: 'attribute_not_exists(id)',
      }),
    );
  } catch (err) {
    const errorName = (err as { name?: string }).name;
    if (errorName === 'ConditionalCheckFailedException') {
      return error(409, `Slug "${input.id}" already exists`);
    }
    throw err;
  }

  // Step 6: parse GPX
  let conversion;
  try {
    conversion = convertGpxToGeoJson(gpxFile.data.toString('utf-8'));
  } catch (err) {
    // Rollback the slug claim
    await ddb.send(new DeleteCommand({ TableName: ROUTES_TABLE, Key: { id: input.id } })).catch(() => {});
    return error(400, `GPX conversion failed: ${(err as Error).message}`);
  }

  // Step 7: write GeoJSON to S3
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key,
        Body: JSON.stringify(conversion.geojson),
        ContentType: 'application/geo+json',
      }),
    );
  } catch (err) {
    // Rollback the slug claim
    await ddb.send(new DeleteCommand({ TableName: ROUTES_TABLE, Key: { id: input.id } })).catch(() => {});
    throw err;
  }

  return json(200, {
    id: input.id,
    filename,
    feature_count: conversion.geojson.features.length,
    point_count: conversion.pointCount,
  });
}
