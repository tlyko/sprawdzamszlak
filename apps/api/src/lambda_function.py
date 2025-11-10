# src/lambda_function.py
import json
import boto3
import os

# Create boto3 clients ONCE (outside the handler) for performance
dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client('s3') # NEW: S3 client

# --- Load Environment Variables ---
PEAKS_TABLE_NAME = os.environ.get('DYNAMODB_TABLE_NAME')
ROUTES_TABLE_NAME = os.environ.get('DYNAMODB_ROUTES_TABLE_NAME')
S3_BUCKET_NAME = os.environ.get('S3_BUCKET_NAME')

if not PEAKS_TABLE_NAME or not ROUTES_TABLE_NAME or not S3_BUCKET_NAME:
    raise RuntimeError("Missing required environment variables")

peaks_table = dynamodb.Table(PEAKS_TABLE_NAME)
routes_table = dynamodb.Table(ROUTES_TABLE_NAME)

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
}
# ---------------------

def lambda_handler(event, context):
    try:
        http_method = event.get('requestContext', {}).get('http', {}).get('method', '')
        http_path = event.get('requestContext', {}).get('http', {}).get('path', '')
        
        if http_method == 'OPTIONS':
            return create_success_response("", 204)

        # --- ROUTING ---
        
        # Route 1: GET / (Get all PEAKS)
        if http_method == 'GET' and http_path.endswith('/'):
            response = peaks_table.scan()
            items = response.get('Items', [])
            while 'LastEvaluatedKey' in response:
                response = peaks_table.scan(ExclusiveStartKey=response['LastEvaluatedKey'])
                items.extend(response.get('Items', []))
            return create_success_response(items)

        # Route 2: GET /routes (Get all ROUTES - NOW WITH PRESIGNED URLS)
        if http_method == 'GET' and http_path.endswith('/routes'):
            # 1. Scan DynamoDB to get the list of routes
            response = routes_table.scan()
            items = response.get('Items', [])
            while 'LastEvaluatedKey' in response:
                response = routes_table.scan(ExclusiveStartKey=response['LastEvaluatedKey'])
                items.extend(response.get('Items', []))

            # 2. --- NEW: Generate Presigned URLs ---
            presigned_routes = []
            for item in items:
                try:
                    # Construct the S3 key
                    s3_key = f"trails/{item['filename']}"
                    
                    # Generate a temporary (15 min) URL
                    presigned_url = s3_client.generate_presigned_url(
                        'get_object',
                        Params={'Bucket': S3_BUCKET_NAME, 'Key': s3_key},
                        ExpiresIn=900  # URL is valid for 15 minutes
                    )
                    
                    # Replace the simple 'filename' with the secure URL
                    item['geojson_url'] = presigned_url
                    presigned_routes.append(item)
                    
                except Exception as e:
                    print(f"Error generating presigned URL for {item.get('id')}: {e}")
                    # Optionally skip this item if URL generation fails

            return create_success_response(presigned_routes)
        
        # Route 3: POST / (Save a new PEAK)
        if http_method == 'POST' and http_path.endswith('/'):
            # (Your existing POST logic - unchanged)
            body_str = event.get('body', '{}')
            data_to_save = json.loads(body_str)
            if 'id' not in data_to_save or 'name' not in data_to_save:
                return create_error_response(400, "Missing 'id' or 'name'")
            peaks_table.put_item(Item=data_to_save)
            return create_success_response({"message": "Successfully saved item", "item": data_to_save}, 201)

        # Default 404
        return create_error_response(404, f"Path {http_method} {http_path} not found")
    
    except Exception as e:
        print(f"!!! LAMBDA CRASHED: {e}")
        return create_error_response(500, f"Internal Server Error: {str(e)}")


# --- Helper Functions (Unchanged) ---
def create_success_response(body, status_code=200):
    return { "statusCode": status_code, "headers": CORS_HEADERS, "body": "" if status_code == 204 else json.dumps(body, default=str) }
def create_error_response(status_code, message):
    return { "statusCode": status_code, "headers": CORS_HEADERS, "body": json.dumps({ "message": message }) }