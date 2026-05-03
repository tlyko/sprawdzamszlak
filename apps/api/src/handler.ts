// W1 stub. Real implementation comes in W2 (TS rewrite of the Python handler)
// and W3-W5 (admin endpoints + Strava integration).
//
// Lambda is currently invoked via API Gateway HTTP API v2, so the event shape
// is `APIGatewayProxyEventV2`.

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

export const handler = async (
  _event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'hello from W1 stub — TS rewrite arrives in W2' }),
  };
};
