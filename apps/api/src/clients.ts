// Shared AWS clients + env helpers. Module-scoped so cold start pays the
// constructor cost once per Lambda container.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { SSMClient } from '@aws-sdk/client-ssm';

export function envOrThrow(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

export const REGION = envOrThrow('MY_AWS_REGION');

export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});

export const s3 = new S3Client({ region: REGION });

export const ssm = new SSMClient({ region: REGION });
