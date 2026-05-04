// Synthetic Strava webhook event — exercises the full pipeline (slice B
// webhook handler → events table → DDB Stream → fetcher Lambda) without
// waiting for a real Strava push.
//
// Pick any past activity_id from the owner's Strava account (visible in
// strava.com/activities/<id>). Owner's athlete_id is read from the SSM
// tokens parameter so it's not on the command line. The webhook handler
// validates body shape via zod and writes a row keyed on event_id =
// {subscription_id}#{object_id}#{event_time} — using a synthetic
// subscription_id (999999) keeps replays from colliding with real events.
//
// Usage:
//   corepack pnpm -F api strava:replay <activity_id> [aspect_type]
//
// aspect_type defaults to "create"; use "update" for activities that
// already exist on Strava (Strava itself only sends "update" for old ones).

import {
  SSMClient,
  GetParameterCommand,
} from '@aws-sdk/client-ssm';

const REGION = process.env.AWS_REGION ?? 'eu-west-1';

const WEBHOOK_URL =
  process.env.STRAVA_WEBHOOK_URL ??
  'https://akoz890bg6.execute-api.eu-west-1.amazonaws.com/prod/strava/webhook';

const PARAM_TOKENS = '/sprawdzamszlak/strava/tokens';

// Fixed synthetic subscription id; real Strava subscription_ids are different
// (visible in /sprawdzamszlak/strava/subscription_id), so replays never alias
// genuine events.
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

async function main() {
  const [, , activityIdArg, aspectArg] = process.argv;
  if (!activityIdArg) {
    console.error('Usage: pnpm -F api strava:replay <activity_id> [aspect_type]');
    console.error('  activity_id : numeric, from strava.com/activities/<id>');
    console.error('  aspect_type : create (default) | update');
    process.exit(1);
  }

  const activityId = Number(activityIdArg);
  if (!Number.isInteger(activityId) || activityId <= 0) {
    console.error(`Bad activity_id: ${activityIdArg}`);
    process.exit(1);
  }

  const aspect = (aspectArg ?? 'create') as 'create' | 'update';
  if (aspect !== 'create' && aspect !== 'update') {
    console.error(`Bad aspect_type: ${aspectArg}. Use create or update.`);
    process.exit(1);
  }

  const athleteId = await getAthleteId();
  const eventTime = Math.floor(Date.now() / 1000);

  const body = {
    object_type: 'activity' as const,
    object_id: activityId,
    aspect_type: aspect,
    owner_id: athleteId,
    subscription_id: SYNTHETIC_SUBSCRIPTION_ID,
    event_time: eventTime,
  };

  console.log(`POST ${WEBHOOK_URL}`);
  console.log(`  object_id=${activityId}  athlete_id=${athleteId}  event_time=${eventTime}`);

  const resp = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    console.error(`HTTP ${resp.status}: ${await resp.text().catch(() => '<unreadable>')}`);
    process.exit(1);
  }
  console.log(`→ ${resp.status} ${resp.statusText}`);
  console.log('');
  console.log('Tail fetcher logs (cold start ~1s, +Strava API ~1-2s):');
  console.log(`  aws logs tail /aws/lambda/sprawdzamszlak-app-fetcher --follow --region ${REGION}`);
  console.log('');
  console.log('Verify the route appears (id strava-' + activityId + '):');
  console.log(
    `  curl -s ${WEBHOOK_URL.replace('/strava/webhook', '/routes')} | jq 'map(select(.id=="strava-${activityId}"))'`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
