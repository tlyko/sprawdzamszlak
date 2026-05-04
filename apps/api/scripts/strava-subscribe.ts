// Register the Strava push subscription that drives our webhook (ADR-003 D4).
//
// Run locally with the owner's AWS SSO creds:
//   corepack pnpm -F api strava:subscribe
//
// Strava allows exactly one subscription per app. The script:
//   1. Reads client_id + client_secret from SSM
//   2. Generates verify_token (and stores it in SSM) if not present
//   3. POSTs to https://www.strava.com/api/v3/push_subscriptions
//   4. Strava immediately calls our GET /strava/webhook for handshake —
//      the webhook Lambda must already be deployed and serving for this
//      to succeed
//   5. Saves the returned subscription_id to SSM
//
// To reset: run strava-unsubscribe.ts first, then re-run this.

import { randomBytes } from 'node:crypto';
import {
  SSMClient,
  GetParameterCommand,
  PutParameterCommand,
} from '@aws-sdk/client-ssm';

const REGION = process.env.AWS_REGION ?? 'eu-west-1';

// Override via env if you need a different env (currently only prod exists).
const CALLBACK_URL =
  process.env.STRAVA_WEBHOOK_URL ??
  'https://akoz890bg6.execute-api.eu-west-1.amazonaws.com/prod/strava/webhook';

const PARAM_CLIENT_ID = '/sprawdzamszlak/strava/client_id';
const PARAM_CLIENT_SECRET = '/sprawdzamszlak/strava/client_secret';
const PARAM_VERIFY_TOKEN = '/sprawdzamszlak/strava/verify_token';
const PARAM_SUBSCRIPTION_ID = '/sprawdzamszlak/strava/subscription_id';

const ssm = new SSMClient({ region: REGION });

async function getParam(name: string, decrypt = true): Promise<string | undefined> {
  try {
    const out = await ssm.send(
      new GetParameterCommand({ Name: name, WithDecryption: decrypt }),
    );
    return out.Parameter?.Value;
  } catch (err) {
    if ((err as { name?: string }).name === 'ParameterNotFound') return undefined;
    throw err;
  }
}

async function putParam(name: string, value: string, secure: boolean): Promise<void> {
  await ssm.send(
    new PutParameterCommand({
      Name: name,
      Value: value,
      Type: secure ? 'SecureString' : 'String',
      Overwrite: true,
    }),
  );
}

async function main() {
  const [clientId, clientSecret, existing] = await Promise.all([
    getParam(PARAM_CLIENT_ID),
    getParam(PARAM_CLIENT_SECRET),
    getParam(PARAM_SUBSCRIPTION_ID, false),
  ]);
  if (!clientId || !clientSecret) {
    throw new Error(
      `Missing ${PARAM_CLIENT_ID} or ${PARAM_CLIENT_SECRET} in SSM. Owner-managed; put via aws ssm put-parameter.`,
    );
  }
  if (existing) {
    console.error(
      `Already subscribed (subscription_id=${existing}). Run strava:unsubscribe first.`,
    );
    process.exit(1);
  }

  let verifyToken = await getParam(PARAM_VERIFY_TOKEN);
  if (!verifyToken) {
    verifyToken = randomBytes(32).toString('base64url');
    await putParam(PARAM_VERIFY_TOKEN, verifyToken, true);
    console.log(`Generated verify_token (43 chars) and stored at ${PARAM_VERIFY_TOKEN}.`);
  }

  console.log(`POST https://www.strava.com/api/v3/push_subscriptions`);
  console.log(`  callback_url=${CALLBACK_URL}`);

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    callback_url: CALLBACK_URL,
    verify_token: verifyToken,
  });

  const resp = await fetch('https://www.strava.com/api/v3/push_subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const respBody = await resp.text();

  if (!resp.ok) {
    console.error(`Subscribe failed (HTTP ${resp.status}):`);
    console.error(respBody);
    process.exit(1);
  }

  const result = JSON.parse(respBody) as { id: number };
  if (typeof result.id !== 'number') {
    console.error('Unexpected response shape from Strava:', respBody);
    process.exit(1);
  }

  await putParam(PARAM_SUBSCRIPTION_ID, String(result.id), false);
  console.log(`Subscribed. subscription_id=${result.id} stored at ${PARAM_SUBSCRIPTION_ID}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
