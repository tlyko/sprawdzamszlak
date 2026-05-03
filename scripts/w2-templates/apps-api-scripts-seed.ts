// Seed script: writes peaks/routes from seeds/*.json into DynamoDB.
//
// This replaces the previous Terraform anti-pattern of managing
// `aws_dynamodb_table_item` resources from `locals.tf`. Now data is in JSON
// files (versioned with the code) and applied through the AWS SDK.
//
// Run via:
//   corepack pnpm -F api seed
// or for production:
//   AWS_PROFILE=sprawdzamszlak corepack pnpm -F api seed
//
// Idempotent — uses PutItem (overwrite by id), so re-running is safe.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  BatchWriteCommand,
  type BatchWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { PeakSchema, RouteSchema, type Peak, type Route } from '@sprawdzamszlak/shared';

const REGION = process.env.AWS_REGION ?? 'eu-west-1';
const PEAKS_TABLE = process.env.DYNAMODB_TABLE_NAME ?? 'sprawdzamszlak-data';
const ROUTES_TABLE = process.env.DYNAMODB_ROUTES_TABLE_NAME ?? 'sprawdzamszlak-routes';

const here = dirname(fileURLToPath(import.meta.url));
const seedsDir = resolve(here, '../seeds');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

// DDB BatchWriteItem limit: 25 items per request.
const BATCH_SIZE = 25;

async function loadJson<T>(file: string): Promise<unknown[]> {
  const content = await readFile(resolve(seedsDir, file), 'utf-8');
  return JSON.parse(content);
}

function chunked<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

async function batchPut(table: string, items: unknown[]): Promise<void> {
  for (const chunk of chunked(items, BATCH_SIZE)) {
    const params: BatchWriteCommandInput = {
      RequestItems: {
        [table]: chunk.map((Item) => ({ PutRequest: { Item: Item as Record<string, unknown> } })),
      },
    };
    let unprocessed = (await ddb.send(new BatchWriteCommand(params))).UnprocessedItems;
    let attempts = 0;
    while (unprocessed && Object.keys(unprocessed).length > 0 && attempts < 3) {
      attempts++;
      await new Promise((r) => setTimeout(r, 200 * 2 ** attempts));
      const retry = await ddb.send(new BatchWriteCommand({ RequestItems: unprocessed }));
      unprocessed = retry.UnprocessedItems;
    }
    if (unprocessed && Object.keys(unprocessed).length > 0) {
      throw new Error(`BatchWrite failed for ${table} after retries`);
    }
  }
}

async function main() {
  // Validate every row through zod before sending to DDB. A bad seed file
  // should fail loudly here, not silently corrupt production.
  const rawPeaks = await loadJson('peaks.json');
  const peaks: Peak[] = rawPeaks.map((row) => PeakSchema.parse(row));
  console.log(`Validated ${peaks.length} peaks`);

  const rawRoutes = await loadJson('routes.json');
  const routes: Route[] = rawRoutes.map((row) => RouteSchema.parse(row));
  console.log(`Validated ${routes.length} routes`);

  console.log(`Writing peaks → ${PEAKS_TABLE}…`);
  await batchPut(PEAKS_TABLE, peaks);
  console.log('  done');

  console.log(`Writing routes → ${ROUTES_TABLE}…`);
  await batchPut(ROUTES_TABLE, routes);
  console.log('  done');

  console.log('Seed complete.');
}

await main();
