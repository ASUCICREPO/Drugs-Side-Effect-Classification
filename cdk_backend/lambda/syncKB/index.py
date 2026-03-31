# lambda/syncKB/index.py
import boto3
import logging
import os
from botocore.exceptions import ClientError

# Initialize logger
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize Bedrock client
bedrock = boto3.client('bedrock-agent-runtime')

# Retrieve environment variables
KNOWLEDGE_BASE_ID = os.environ.get('KNOWLEDGE_BASE_ID')
DATA_SOURCE_ID = os.environ.get('DATA_SOURCE_ID')

def sync_knowledge_base(event, context):
    """Sync the knowledge base when triggered by S3 events."""
    try:
        logger.info(f"Starting Bedrock Ingestion Job for Knowledge Base [{KNOWLEDGE_BASE_ID}], Data Source: [{DATA_SOURCE_ID}]...")
        
        # Start the ingestion job in Bedrock
        response = bedrock.start_ingestion_job(
            knowledgeBaseId=KNOWLEDGE_BASE_ID,
            dataSourceId=DATA_SOURCE_ID
        )
        
        # Log the ingestion job ID
        logger.info(f"Started knowledge base sync: {response['ingestionJob']['ingestionJobId']}")
        
    except ClientError as e:
        logger.exception(f"Error syncing knowledge base: {str(e)}")

