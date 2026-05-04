// Bulk replay — synthetic webhook for a list of activity IDs.
//
// Use case: re-seed the routes table with Strava-imported versions of every
// past trip. Pass activity IDs as positional args (or one per line on stdin
// if no args given). Each gets a separate POST to /strava/webhook with a
// fresh event_time so synthetic event_ids stay unique.
//
// Usage:
//   corepack pnpm -F api strava:replay-many <id1> <id2> <id3> ...
//   echo "12345\n67890" | corepack pnpm -F api strava:replay-many
//
// After all POSTs return 200, fetcher Lambda runs once per ID via DDB Stream
// (cold start ~1s, +Strava API ~1-2s, +1-2s for S3+DDB write). Watch:
//   aws logs tail /aws/lambda/sprawdzamszlak-app-fetcher --follow --region eu-west-1
//
// Caveat about names: the fetcher uses Strava's activity.name verbatim. If
// your old activities are named "Hike 04/2024" or similar, that's what you'll
// get. RENAME them on Strava BEFORE running this if you care about the
// in-app label.

import { readFileSync } from 'node:fs';
import {
  SSMClient,
  GetParameterCommand,
} from '@aws-sdk/client-ssm';

const REGION = process.env.AWS_REGION ?? 'eu-west-1';

const WEBHOOK_URL =
  process.env.STRAVA_WEBHOOK_URL ??
  'https://akoz890bg6.execute-api.eu-west-1.amazonaws.com/prod/strava/webhook';

const PARAM_TOKENS = '/sprawdzamszlak/strava/tokens';
const SYNTHETIC_SUBSCRIPTION_ID = 999999;

const ssm = new SSMClient({ region: REGION });

async function getAthleteId(): Promise<number> {
  const out = await ssm.send(
    new GetParameterCommand({ Name: PARAM_TOKENS, WithDecryption: true }),
  );
  if (!out.Parameter?.Value) {
    throw new Error(
      `${PARAM_TOKENS} not found. Complete OAuth at https://sprawdzamszlak.pl/strava first.`,
    );
  }
  const tokens = JSON.parse(out.Parameter.Value) as { athlete_id?: number };
  if (typeof tokens.athlete_id !== 'number') {
    throw new Error(`${PARAM_TOKENS} has no athlete_id field`);
  }
  return tokens.athlete_id;
}

function readIdsFromStdin(): number[] {
  if (process.stdin.isTTY) return [];
  const raw = readFileSync(0, 'utf-8');
  return raw
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
}

async function main() {
  const argIds = process.argv.slice(2).map(Number).filter((n) => Number.isInteger(n) && n > 0);
  const ids = argIds.length > 0 ? argIds : readIdsFromStdin();

  if (ids.length === 0) {
    console.error('Usage: pnpm -F api strava:replay-many <id1> <id2> ...');
    console.error('       echo "12345 67890" | pnpm -F api strava:replay-many');
    process.exit(1);
  }

  const athleteId = await getAthleteId();
  console.log(`Replaying ${ids.length} activities (athlete ${athleteId}):`);

  let ok = 0;
  let fail = 0;
  for (const [i, activityId] of ids.entries()) {
    // 1s spacing between event_time stamps so synthetic event_ids stay
    // unique even if a fast machine fires multiple in the same wallclock
    // second.
    const eventTime = Math.floor(Date.now() / 1000) + i;

    const body = {
      object_type: 'activity' as const,
      object_id: activityId,
      aspect_type: 'create' as const,
      owner_id: athleteId,
      subscription_id: SYNTHETIC_SUBSCRIPTION_ID,
      event_time: eventTime,
    };

    try {
      const resp = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (resp.ok) {
        console.log(`  [${i + 1}/${ids.length}] ${activityId} → ${resp.status} OK`);
        ok++;
      } else {
        const text = await resp.text().catch(() => '<unreadable>');
        console.error(`  [${i + 1}/${ids.length}] ${activityId} → HTTP ${resp.status}: ${text}`);
        fail++;
      }
    } catch (err) {
      console.error(`  [${i + 1}/${ids.length}] ${activityId} → ${err}`);
      fail++;
    }
  }

  console.log('');
  console.log(`Submitted: ${ok} ok, ${fail} fail.`);
  console.log('');
  console.log('Watch fetcher logs:');
  console.log(`  aws logs tail /aws/lambda/sprawdzamszlak-app-fetcher --follow --region ${REGION}`);
  console.log('');
  console.log('After all imports settle, run:');
  console.log('  corepack pnpm -F api strava:drop-manual-seeds --dry-run');
  console.log('to preview removal of the original manual-seed entries (anything not strava-*).');

  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
