# src/lambda_function.py
import json
import boto3
import os

dynamodb = boto3.resource('dynamodb')

TABLE_NAME = os.environ['DYNAMODB_TABLE_NAME']
table = dynamodb.Table(TABLE_NAME)

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
}
# ---------------------


def lambda_handler(event, context):
    
    try:
        body_str = event.get('body', '{}')
        if not body_str:
            body_str = '{}'
            
        data_to_save = json.loads(body_str)

        if 'id' not in data_to_save:
            raise ValueError("Missing 'id' in the data to save")

        table.put_item(
            Item=data_to_save
        )

        return {
            "statusCode": 201,
            "headers": CORS_HEADERS,
            "body": json.dumps({
                "message": "Successfully saved item",
                "item": data_to_save
            })
        }

    except Exception as e:
        print(f"Error: {e}")
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({
                "message": "Server error occurred",
                "error": str(e)
            })
        }