# lambda/connect-handler/index.py

import json
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
      connection_id = event.get('requestContext', {}).get('connectionId')
      logger.info(f"Connect requested for connectionId: {connection_id}")

      # Simply return a successful status code for the handshake
      return {
          'statusCode': 200,
          'body': json.dumps({'message': 'Connect successful'})
      }
  
