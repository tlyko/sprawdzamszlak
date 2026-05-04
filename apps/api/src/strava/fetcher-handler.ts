// Lambda entry point for the fetcher (ADR-003 D2).
//
// Triggered by DDB Streams on the strava-events table. Stream view type is
// NEW_IMAGE (set in Terraform) so we read the freshly-written event row
// without an extra GetItem round-trip.
//
// Per-record error handling: log + continue. Lambda's stream poller treats
// the batch as "successful" if we don't throw; failed individual events
// stay in the events table (TTL 7 days) and can be replayed by re-inserting.

import type { DynamoDBStreamEvent, DynamoDBRecord } from 'aws-lambda';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import { processActivityEvent, type FetcherEventInput } from './fetcher.js';

interface PersistedEvent {
  event_id: string;
  object_type: string;
  object_id: number;
  aspect_type: 'create' | 'update' | 'delete';
}

function unmarshallRecord(record: DynamoDBRecord): PersistedEvent | null {
  if (record.eventName !== 'INSERT') return null;
  const image = record.dynamodb?.NewImage;
  if (!image) return null;
  // The aws-lambda type for NewImage is structurally identical to the SDK's
  // AttributeValue map but doesn't share the nominal type. Cast is safe.
  return unmarshall(image as Record<string, AttributeValue>) as PersistedEvent;
}

export const handler = async (event: DynamoDBStreamEvent): Promise<void> => {
  for (const record of event.Records) {
    const persisted = unmarshallRecord(record);
    if (!persisted) continue;

    const input: FetcherEventInput = {
      object_type: persisted.object_type,
      object_id: persisted.object_id,
      aspect_type: persisted.aspect_type,
    };

    try {
      await processActivityEvent(input);
    } catch (err) {
      // Don't propagate — one bad event shouldn't block the rest of the
      // batch. Keep the source row in the events table for manual replay.
      console.error('Fetcher failed for event', { event_id: persisted.event_id, err });
    }
  }
};
