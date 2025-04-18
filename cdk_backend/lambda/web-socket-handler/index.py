# /home/zvallarino/AI_AWS_PC/Drugs-Side-Effect-Classification/cdk_backend/lambda/web-socket-handler/index.py
import os
import json
import boto3
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

lambda_client = boto3.client('lambda')

def handle_message(event, connection_id):
    logger.info(f"handle_message called with event: {json.dumps(event)}")
    response_function_arn = os.environ['RESPONSE_FUNCTION_ARN']

    try:
        body_str = event.get('body', '{}')
        body = json.loads(body_str)

        prompt = body.get('prompt')
        history = body.get('history', [])
        selected_role = body.get('role', 'researchAssistant') # *** EXTRACT ROLE, provide default ***

        if not isinstance(history, list):
            logger.warning(f"Expected 'history' to be a list, but got {type(history)}. Setting history to an empty list.")
            history = []

        input_payload = {
            "prompt": prompt,
            "connectionId": connection_id,
            "history": history,
            "role": selected_role # *** ADD ROLE TO PAYLOAD ***
        }

        logger.info(f"Invoking lambdaXbedrock with payload: {json.dumps(input_payload)}")

        lambda_client.invoke(
            FunctionName=response_function_arn,
            InvocationType='Event', # Asynchronous invocation
            Payload=json.dumps(input_payload)
        )

        return {'statusCode': 200, 'body': json.dumps({'message': 'Message forwarded successfully'})}

    except json.JSONDecodeError:
        logger.error("Failed to decode JSON body")
        return {'statusCode': 400, 'body': json.dumps({'error': 'Invalid JSON format in request body.'})}
    except Exception as e:
        logger.error(f"Error in handle_message: {e}")
        logger.exception("Exception details:") # Log stack trace
        # Optionally send an error back via websocket if possible and safe
        return {'statusCode': 500, 'body': json.dumps({'error': 'Internal server error processing message.'})}


def lambda_handler(event, context):
    logger.info(f"lambda_handler called with event: {json.dumps(event)}")
    route_key = event.get('requestContext', {}).get('routeKey')
    connection_id = event.get('requestContext', {}).get('connectionId')

    if not connection_id:
        logger.error("Missing connectionId in requestContext")
        # For $connect/$disconnect, connectionId might be present but routeKey absent.
        # For sendMessage, it should always be there.
        if route_key == 'sendMessage': # Only return error if it's a message route without ID
             return {'statusCode': 400, 'body': 'Connection ID missing.'}
        else:
             # Allow connect/disconnect etc. even without explicitly checking ID here
             logger.info(f"Handling non-sendMessage route: {route_key}")
             # Handle connect/disconnect logic if needed, or just return success for default/connect
             return {'statusCode': 200, 'body': 'Route processed.'} # Adjust as needed

    if route_key == '$connect':
         logger.info(f"Handling $connect for connectionId: {connection_id}")
         # Your connect logic (e.g., store connectionId if needed)
         return {'statusCode': 200, 'body': 'Connect successful.'}
    elif route_key == '$disconnect':
         logger.info(f"Handling $disconnect for connectionId: {connection_id}")
         # Your disconnect logic (e.g., remove connectionId if stored)
         return {'statusCode': 200, 'body': 'Disconnect successful.'}
    elif route_key == 'sendMessage':
        logger.info(f"Handling sendMessage for connectionId: {connection_id}")
        return handle_message(event, connection_id)
    else:
        logger.warning(f"Unsupported routeKey: {route_key} for connectionId: {connection_id}")
        # Returning 200 to prevent API Gateway from potentially disconnecting the client on unknown routes
        # You might want a 400/404 depending on your desired behavior.
        return {'statusCode': 200, 'body': json.dumps({'message': f'Unsupported route: {route_key}'})}