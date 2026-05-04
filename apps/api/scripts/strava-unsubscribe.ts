// Tear down the Strava push subscription (ADR-003 D4).
//
// Run locally with the owner's AWS SSO creds:
//   corepack pnpm -F api strava:unsubscribe
//
// Use cases: rotating verify_token, switching environments, recovering
// from a "subscription stuck" state.

import {
  SSMClient,
  GetParameterCommand,
  DeleteParameterCommand,
} from '@aws-sdk/client-ssm';

const REGION = process.env.AWS_REGION ?? 'eu-west-1';

const PARAM_CLIENT_ID = '/sprawdzamszlak/strava/client_id';
const PARAM_CLIENT_SECRET = '/sprawdzamszlak/strava/client_secret';
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

async function main() {
  const [clientId, clientSecret, subscriptionId] = await Promise.all([
    getParam(PARAM_CLIENT_ID),
    getParam(PARAM_CLIENT_SECRET),
    getParam(PARAM_SUBSCRIPTION_ID, false),
  ]);
  if (!clientId || !clientSecret) {
    throw new Error(`Missing ${PARAM_CLIENT_ID} or ${PARAM_CLIENT_SECRET} in SSM.`);
  }
  if (!subscriptionId) {
    console.error(`No ${PARAM_SUBSCRIPTION_ID} in SSM — nothing to unsubscribe.`);
    process.exit(0);
  }

  const url = new URL(
    `https://www.strava.com/api/v3/push_subscriptions/${subscriptionId}`,
  );
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('client_secret', clientSecret);

  console.log(`DELETE ${url.origin}${url.pathname} (subscription_id=${subscriptionId})`);

  const resp = await fetch(url, { method: 'DELETE' });

  if (!resp.ok && resp.status !== 404) {
    const respBody = await resp.text();
    console.error(`Unsubscribe failed (HTTP ${resp.status}):`);
    console.error(respBody);
    process.exit(1);
  }

  await ssm.send(new DeleteParameterCommand({ Name: PARAM_SUBSCRIPTION_ID }));
  console.log(`Unsubscribed. ${PARAM_SUBSCRIPTION_ID} deleted.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
