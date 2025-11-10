# src/lambda_function.py
import json
import boto3
import os

dynamodb = boto3.resource('dynamodb')

TABLE_NAME = os.environ['DYNAMODB_TABLE_NAME']
table = dynamodb.Table(TABLE_NAME)

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS" # Allowed methods
}
# ---------------------


def lambda_handler(event, context):
    print(f"Received event: {json.dumps(event)}")
    
    # Extract the HTTP method from the API Gateway v2 payload
    http_method = event.get('requestContext', {}).get('http', {}).get('method', '')
    
    # --- HANDLE CORS PREFLIGHT (OPTIONS) ---
    # The browser sends an OPTIONS request before GET/POST to check CORS permissions
    if http_method == 'OPTIONS':
        return {
            "statusCode": 204, # No Content
            "headers": CORS_HEADERS,
            "body": "" # Empty body
        }

    # --- HANDLE GET (Read all peaks) ---
    if http_method == 'GET':
        try:
            # Scan the ENTIRE table. This is OK for a small number of peaks.
            # For a large dataset, you'd use Query with an index.
            response = table.scan()
            items = response.get('Items', [])
            
            # Loop if the table is large and results are paginated
            while 'LastEvaluatedKey' in response:
                response = table.scan(ExclusiveStartKey=response['LastEvaluatedKey'])
                items.extend(response.get('Items', []))

            return {
                "statusCode": 200,
                "headers": CORS_HEADERS,
                # default=str handles special types like Decimal from DynamoDB
                "body": json.dumps(items, default=str) 
            }
        
        except Exception as e:
            print(f"Error scanning table: {e}")
            return create_error_response(500, f"Server error scanning table: {str(e)}")

    # --- HANDLE POST (Save a new peak) ---
    if http_method == 'POST':
        try:
            body_str = event.get('body', '{}')
            if not body_str: # Handle empty body
                body_str = '{}'
            
            data_to_save = json.loads(body_str)

            # Basic validation
            if 'id' not in data_to_save or 'name' not in data_to_save:
                return create_error_response(400, "Missing 'id' or 'name' in the data to save")

            # Save the item to DynamoDB
            table.put_item(Item=data_to_save)

            return {
                "statusCode": 201, # Created
                "headers": CORS_HEADERS,
                "body": json.dumps({
                    "message": "Successfully saved item",
                    "item": data_to_save
                })
            }

        except Exception as e:
            return create_error_response(500, f"Server error putting item: {str(e)}")

    # Default response if the method is not supported (e.g., PUT, DELETE)
    return create_error_response(405, f"Method {http_method} not allowed")


def create_error_response(status_code, message):
    """Helper function to create a standardized error response."""
    return {
        "statusCode": status_code,
        "headers": CORS_HEADERS,
        "body": json.dumps({
            "message": message
        })
    }