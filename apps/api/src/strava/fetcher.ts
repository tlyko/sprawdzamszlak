// Strava activity fetcher (ADR-003 D2 — async side of the webhook hand-off).
//
// Triggered off DDB Streams on the strava-events table. Per logical event
// the fetcher:
//   1. Loads the OAuth token tuple from Parameter Store, refreshes if expired.
//   2. GET /activities/{id} for metadata (filters by sport_type allowlist).
//   3. GET /activities/{id}/streams?keys=latlng,altitude,time,distance.
//   4. Converts the latlng stream into a GeoJSON Feature (LineString).
//   5. PUT GeoJSON to S3, PUT row to the routes table.
//
// On Strava-side errors (404, 401 after refresh, etc.) we log and return —
// the event row stays in the events table for 7 days, manual replay possible
// by re-inserting it (Streams will fire the fetcher again).

import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { GetParameterCommand, PutParameterCommand } from '@aws-sdk/client-ssm';
import {
  StravaTokensSchema,
  SPORT_TYPE_ALLOWLIST,
  type StravaTokens,
  type StravaSportType,
} from '@sprawdzamszlak/shared';
import { ddb, s3, ssm, envOrThrow } from '../clients.js';

const ROUTES_TABLE = envOrThrow('DYNAMODB_ROUTES_TABLE_NAME');
const S3_BUCKET = envOrThrow('S3_BUCKET_NAME');

const PARAM_CLIENT_ID = '/sprawdzamszlak/strava/client_id';
const PARAM_CLIENT_SECRET = '/sprawdzamszlak/strava/client_secret';
const PARAM_TOKENS = '/sprawdzamszlak/strava/tokens';

const REFRESH_THRESHOLD_SECONDS = 60;

let cachedAppCreds: { clientId: string; clientSecret: string } | undefined;

async function getAppCreds(): Promise<{ clientId: string; clientSecret: string }> {
  if (cachedAppCreds) return cachedAppCreds;
  const [idOut, secretOut] = await Promise.all([
    ssm.send(new GetParameterCommand({ Name: PARAM_CLIENT_ID })),
    ssm.send(new GetParameterCommand({ Name: PARAM_CLIENT_SECRET, WithDecryption: true })),
  ]);
  const clientId = idOut.Parameter?.Value;
  const clientSecret = secretOut.Parameter?.Value;
  if (!clientId || !clientSecret) {
    throw new Error('Missing Strava client_id or client_secret in Parameter Store');
  }
  cachedAppCreds = { clientId, clientSecret };
  return cachedAppCreds;
}

async function loadTokens(): Promise<StravaTokens> {
  const out = await ssm.send(
    new GetParameterCommand({ Name: PARAM_TOKENS, WithDecryption: true }),
  );
  if (!out.Parameter?.Value) {
    throw new Error(`Missing tokens in Parameter Store (${PARAM_TOKENS}). OAuth not completed.`);
  }
  return StravaTokensSchema.parse(JSON.parse(out.Parameter.Value));
}

async function saveTokens(tokens: StravaTokens): Promise<void> {
  await ssm.send(
    new PutParameterCommand({
      Name: PARAM_TOKENS,
      Type: 'SecureString',
      Value: JSON.stringify(tokens),
      Overwrite: true,
    }),
  );
}

async function refreshTokens(current: StravaTokens): Promise<StravaTokens> {
  const { clientId, clientSecret } = await getAppCreds();
  const resp = await fetch('https://www.strava.com/api/v3/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: current.refresh_token,
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '<unreadable>');
    throw new Error(`Token refresh failed: HTTP ${resp.status} ${body}`);
  }
  const raw = (await resp.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
  };
  const refreshed = StravaTokensSchema.parse({
    access_token: raw.access_token,
    refresh_token: raw.refresh_token,
    expires_at: raw.expires_at,
    athlete_id: current.athlete_id,
  });
  await saveTokens(refreshed);
  return refreshed;
}

async function getValidAccessToken(): Promise<string> {
  const tokens = await loadTokens();
  const now = Math.floor(Date.now() / 1000);
  if (tokens.expires_at - now > REFRESH_THRESHOLD_SECONDS) {
    return tokens.access_token;
  }
  console.info('Refreshing Strava access token');
  const refreshed = await refreshTokens(tokens);
  return refreshed.access_token;
}

// ---------------------------------------------------------------------------
// Strava API
// ---------------------------------------------------------------------------
interface StravaActivity {
  id: number;
  name: string;
  sport_type: string;
  start_date: string;
  distance?: number;
  total_elevation_gain?: number;
}

interface StravaLatLngStream {
  type: 'latlng';
  data: Array<[number, number]>; // [lat, lng]
}

interface StravaAltitudeStream {
  type: 'altitude';
  data: number[];
}

type StravaStream = StravaLatLngStream | StravaAltitudeStream | { type: string; data: unknown };

async function fetchActivity(id: number, accessToken: string): Promise<StravaActivity | null> {
  const resp = await fetch(`https://www.strava.com/api/v3/activities/${id}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (resp.status === 404) {
    console.warn(`Activity ${id} not found (404) — likely deleted on Strava`);
    return null;
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => '<unreadable>');
    throw new Error(`fetchActivity ${id} failed: HTTP ${resp.status} ${body}`);
  }
  return (await resp.json()) as StravaActivity;
}

async function fetchActivityStreams(id: number, accessToken: string): Promise<StravaStream[]> {
  const url = new URL(`https://www.strava.com/api/v3/activities/${id}/streams`);
  url.searchParams.set('keys', 'latlng,altitude,time,distance');
  url.searchParams.set('key_by_type', 'false');
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '<unreadable>');
    throw new Error(`fetchActivityStreams ${id} failed: HTTP ${resp.status} ${body}`);
  }
  return (await resp.json()) as StravaStream[];
}

// ---------------------------------------------------------------------------
// GeoJSON conversion
// ---------------------------------------------------------------------------
interface GeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: 'LineString';
    // [lng, lat] per GeoJSON spec — note Strava streams are [lat, lng]
    coordinates: Array<[number, number] | [number, number, number]>;
  };
  properties: {
    name: string;
    sport_type: string;
    start_date: string;
    distance?: number;
    total_elevation_gain?: number;
    source: 'strava';
    strava_activity_id: number;
  };
}

function buildGeoJSON(activity: StravaActivity, streams: StravaStream[]): GeoJSONFeature | null {
  const latlng = streams.find((s): s is StravaLatLngStream => s.type === 'latlng');
  if (!latlng || !Array.isArray(latlng.data) || latlng.data.length === 0) {
    return null;
  }
  const altitude = streams.find((s): s is StravaAltitudeStream => s.type === 'altitude');

  const coordinates: GeoJSONFeature['geometry']['coordinates'] = latlng.data.map(
    ([lat, lng], i) => {
      const alt = altitude?.data[i];
      return typeof alt === 'number' ? [lng, lat, alt] : [lng, lat];
    },
  );

  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates },
    properties: {
      name: activity.name,
      sport_type: activity.sport_type,
      start_date: activity.start_date,
      ...(activity.distance !== undefined ? { distance: activity.distance } : {}),
      ...(activity.total_elevation_gain !== undefined
        ? { total_elevation_gain: activity.total_elevation_gain }
        : {}),
      source: 'strava' as const,
      strava_activity_id: activity.id,
    },
  };
}

// ---------------------------------------------------------------------------
// Persist
// ---------------------------------------------------------------------------
async function persistRoute(
  activity: StravaActivity,
  geojson: GeoJSONFeature,
): Promise<void> {
  // id allows hyphens (PeakIdSchema), filename does not (SAFE_FILENAME).
  const id = `strava-${activity.id}`;
  const filename = `strava_${activity.id}.geojson`;

  await s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: `trails/${filename}`,
      Body: JSON.stringify(geojson),
      ContentType: 'application/geo+json',
    }),
  );

  await ddb.send(
    new PutCommand({
      TableName: ROUTES_TABLE,
      Item: {
        id,
        name: activity.name,
        type: 'off-piste', // sport_type-based heuristics deferred
        filename,
      },
    }),
  );
}

// ---------------------------------------------------------------------------
// Orchestration — invoked once per logical webhook event
// ---------------------------------------------------------------------------
export interface FetcherEventInput {
  object_type: string;
  object_id: number;
  aspect_type: 'create' | 'update' | 'delete';
}

export async function processActivityEvent(input: FetcherEventInput): Promise<void> {
  if (input.object_type !== 'activity') {
    console.info(`Skipping non-activity event (${input.object_type})`);
    return;
  }
  if (input.aspect_type === 'delete') {
    // Slice C v1: ignore deletes. The route stays on the map; owner can drop
    // it manually. A future ADR can decide whether webhook deletes should
    // remove the corresponding S3 + DDB row automatically.
    console.info(`Activity ${input.object_id} deleted on Strava — route left in place`);
    return;
  }

  const accessToken = await getValidAccessToken();
  const activity = await fetchActivity(input.object_id, accessToken);
  if (!activity) return;

  if (!(SPORT_TYPE_ALLOWLIST as readonly string[]).includes(activity.sport_type)) {
    console.info(
      `Activity ${activity.id} sport_type=${activity.sport_type} not in allowlist — skipping`,
    );
    return;
  }
  const _sport: StravaSportType = activity.sport_type as StravaSportType;
  void _sport;

  const streams = await fetchActivityStreams(activity.id, accessToken);
  const geojson = buildGeoJSON(activity, streams);
  if (!geojson) {
    console.warn(`Activity ${activity.id} has no latlng stream — skipping (likely indoor)`);
    return;
  }

  await persistRoute(activity, geojson);
  console.info(`Persisted activity ${activity.id} as route strava-${activity.id}`);
}
