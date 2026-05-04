// Drop manual-seed routes after a Strava bulk reseed.
//
// Scans the routes table, finds every row whose `id` does NOT start with
// `strava-`, deletes the DDB row + the corresponding S3 GeoJSON object.
// Pass `--dry-run` to print what would be deleted without touching anything.
//
// Use case: after running strava:replay-many for every old trip, the routes
// table holds duplicates — the original manual seeds AND the new strava-*
// rows. This script clears the manual seeds so the map shows the Strava
// versions only. Idempotent: running it twice does nothing the second time.
//
// Usage:
//   corepack pnpm -F api strava:drop-manual-seeds --dry-run
//   corepack pnpm -F api strava:drop-manual-seeds
//
// Safety:
//   - Dry-run prints every (id, filename) pair it would delete.
//   - Real run requires confirming with the literal string DROP at the prompt.
//   - Deletions are sequenced (DDB first, then S3) so a half-finished run is
//     consistent: a route either exists with both records or neither.

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

const REGION = process.env.AWS_REGION ?? 'eu-west-1';
const ROUTES_TABLE = process.env.DYNAMODB_ROUTES_TABLE_NAME ?? 'sprawdzamszlak-routes';
const S3_BUCKET = process.env.S3_BUCKET_NAME ?? 'sprawdzamszlak-trails-storage-214598715232';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const s3 = new S3Client({ region: REGION });

interface ManualSeedRow {
  id: string;
  filename: string;
  name?: string;
}

async function listManualSeeds(): Promise<ManualSeedRow[]> {
  const items: ManualSeedRow[] = [];
  let cursor: Record<string, unknown> | undefined;
  do {
    const out = await ddb.send(
      new ScanCommand({
        TableName: ROUTES_TABLE,
        ExclusiveStartKey: cursor,
      }),
    );
    for (const raw of out.Items ?? []) {
      const id = raw['id'] as string | undefined;
      const filename = raw['filename'] as string | undefined;
      const name = raw['name'] as string | undefined;
      if (!id || !filename) continue;
      if (id.startsWith('strava-')) continue;
      items.push({ id, filename, name });
    }
    cursor = out.LastEvaluatedKey;
  } while (cursor);
  return items;
}

async function deleteRoute(row: ManualSeedRow): Promise<void> {
  // DDB first — losing the manifest entry hides the orphan S3 object from
  // the API; if the S3 delete fails, the leftover GeoJSON is just dead
  // bytes and easy to clean up later.
  await ddb.send(new DeleteCommand({ TableName: ROUTES_TABLE, Key: { id: row.id } }));
  await s3.send(
    new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: `trails/${row.filename}` }),
  );
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  const seeds = await listManualSeeds();
  if (seeds.length === 0) {
    console.log('Nothing to drop — routes table holds no manual seeds.');
    return;
  }

  console.log(`Manual seeds in ${ROUTES_TABLE} (would-be dropped):`);
  for (const row of seeds) {
    console.log(`  ${row.id.padEnd(28)} → trails/${row.filename}${row.name ? `   ("${row.name}")` : ''}`);
  }
  console.log(`\n${seeds.length} entries.`);

  if (dryRun) {
    console.log('\n--dry-run set, exiting without changes.');
    return;
  }

  const rl = createInterface({ input: stdin, output: stdout });
  const answer = await rl.question('\nType DROP to confirm: ');
  rl.close();
  if (answer.trim() !== 'DROP') {
    console.log('Aborted.');
    return;
  }

  let ok = 0;
  let fail = 0;
  for (const [i, row] of seeds.entries()) {
    try {
      await deleteRoute(row);
      console.log(`  [${i + 1}/${seeds.length}] ${row.id} dropped`);
      ok++;
    } catch (err) {
      console.error(`  [${i + 1}/${seeds.length}] ${row.id} FAILED: ${err}`);
      fail++;
    }
  }

  console.log(`\nDone: ${ok} dropped, ${fail} failed.`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
