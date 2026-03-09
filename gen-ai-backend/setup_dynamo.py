import boto3
import os
from dotenv import load_dotenv

load_dotenv()

region = os.getenv("COGNITO_REGION", "ap-south-1")
dynamodb = boto3.client('dynamodb', region_name=region)

tables = {
    'ChatHistory': {
        'KeySchema': [
            {'AttributeName': 'conversationId', 'KeyType': 'HASH'},
            {'AttributeName': 'timestamp', 'KeyType': 'RANGE'}
        ],
        'AttributeDefinitions': [
            {'AttributeName': 'conversationId', 'AttributeType': 'S'},
            {'AttributeName': 'timestamp', 'AttributeType': 'S'}
        ]
    },
    'UsageLogs': {
        'KeySchema': [
            {'AttributeName': 'logId', 'KeyType': 'HASH'}
        ],
        'AttributeDefinitions': [
            {'AttributeName': 'logId', 'AttributeType': 'S'}
        ]
    },
    'SharedLinks': {
        'KeySchema': [
            {'AttributeName': 'shareId', 'KeyType': 'HASH'}
        ],
        'AttributeDefinitions': [
            {'AttributeName': 'shareId', 'AttributeType': 'S'}
        ]
    },
    'UserFeedback': {
        'KeySchema': [
            {'AttributeName': 'feedbackId', 'KeyType': 'HASH'}
        ],
        'AttributeDefinitions': [
            {'AttributeName': 'feedbackId', 'AttributeType': 'S'}
        ]
    }
}

existing_tables = dynamodb.list_tables()['TableNames']

for table_name, schema in tables.items():
    if table_name not in existing_tables:
        print(f"Creating table {table_name}...")
        try:
            dynamodb.create_table(
                TableName=table_name,
                KeySchema=schema['KeySchema'],
                AttributeDefinitions=schema['AttributeDefinitions'],
                BillingMode='PAY_PER_REQUEST'
            )
            print(f"Table {table_name} created successfully.")
        except Exception as e:
            print(f"Error creating table {table_name}: {e}")
    else:
        print(f"Table {table_name} already exists.")
