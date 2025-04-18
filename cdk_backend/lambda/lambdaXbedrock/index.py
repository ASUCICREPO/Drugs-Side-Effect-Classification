# /home/zvallarino/AI_AWS_PC/Drugs-Side-Effect-Classification/cdk_backend/lambda/lambdaXbedrock/index.py

import os
import json
import boto3
import re
import logging
import datetime # <--- Added import for timestamp
from botocore.exceptions import ClientError # Import ClientError for specific exception handling

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# --- Constants (Keep existing SUPPORTED_COUNTRIES, BOT_PERSONAS, etc.) ---
SUPPORTED_COUNTRIES = {
    # ... keep your existing country set ...
    "afghanistan", "algeria", "argentina", "armenia", "belarus", "belize", "benin",
    "bosnia and herzegovina", "brazil", "burkina faso", "burundi", "cambodia",
    "cameroon", "central africa republic", "colombia", "congo, dem. rep",
    "costa rica", "côte d'ivoire", "china", "pakistan", "thailand", "ethiopia",
    "mauritius", "djibouti", "dominica", "dominican republic", "el salvador",
    "equatorial guinea", "gabon", "gambia", "georgia", "ghana", "grenada",
    "guatemala", "guinea", "guinea-bissau", "india", "indonesia", "jamaica",
    "kenya", "kiribati", "kosovo", "kyrgyz republic","Kyrgyzstan", "lebanon", "lesotho",
    "liberia", "libya", "angola", "madagascar", "malawi", "malaysia", "maldives",
    "mali", "marshall islands", "mexico", "micronesia", "moldova", "mongolia",
    "montenegro", "morocco", "mozambique", "myanmar", "nepal", "nigeria",
    "papua new guinea", "peru", "philippines", "rwanda", "samoa", "senegal",
    "serbia", "sierra leone", "solomon islands", "somalia", "south africa",
    "south sudan", "sri lanka", "st. lucia", "st. vincent and the grenadines",
    "suriname", "tanzania", "lao pdr", "laos",
    "timor-leste", "togo", "tunisia", "türkiye", "turkey",
    "turkmenistan", "uganda", "ukraine", "bhutan", "bangladesh", "uzbekistan",
    "vanuatu", "vietnam", "west bank and gaza", "zambia", "zimbabwe"
}

BOT_PERSONAS = {
    # ... keep your existing persona definitions ...
    "researchAssistant": {
        "name": "Ponyo",
        "prompt": "You are Ponyo, a Research Assistant. Use the provided Knowledge Source Information ONLY to answer the user's question. If the information isn't sufficient to answer, clearly state that you don't have enough information based on the provided sources. Do not use prior knowledge. Be precise and stick strictly to the details found in the Knowledge Source."
    },
    "softwareEngineer": {
        "name": "Chihiro",
        "prompt": "You are Chihiro, a Software Engineer. Provide clear, concise, and technically accurate answers. You can explain concepts, provide code examples (if relevant and safe), and troubleshoot technical problems based on the context provided. Be helpful and efficient."
    },
    "genderYouthExpert": {
        "name": "Kiki",
        "prompt": "You are Kiki, a Gender and Youth Expert. Answer questions related to gender issues, youth development, and related social topics with sensitivity, expertise, and an informative tone. Ensure your responses are respectful, evidence-based (if sources are provided), and appropriate for discussions on these topics."
    },
    "default": { # Fallback persona
        "name": "Assistant",
        "prompt": "You are a helpful assistant."
    }
}

# --- Global Clients and Helper Functions (Keep existing) ---
lambda_region = os.environ.get('AWS_REGION', 'us-east-1')
logger.info(f"Using AWS Region: {lambda_region}")

agent_runtime_client = None
try:
    agent_runtime_client = boto3.client("bedrock-agent-runtime", region_name=lambda_region)
except Exception as e:
    logger.error(f"Error initializing bedrock-agent-runtime client: {e}")

bedrock_runtime_client = None
try:
    bedrock_runtime_client = boto3.client(service_name="bedrock-runtime", region_name=lambda_region)
except Exception as e:
    logger.error(f"Error initializing bedrock-runtime client: {e}")

def send_ws_message(gateway_client, connection_id, data):
    # ... keep existing function ...
    if not gateway_client:
        logger.error(f"Cannot send message to {connection_id}: gateway_client not available.")
        return False
    try:
        gateway_client.post_to_connection(ConnectionId=connection_id, Data=json.dumps(data))
        logger.info(f"Sent message type '{data.get('type', 'unknown')}' to {connection_id}")
        return True
    except ClientError as e:
        if e.response['Error']['Code'] == 'GoneException':
            logger.warning(f"Cannot send message to {connection_id}: Connection is gone (GoneException).")
        else:
            logger.error(f"Failed to send message type '{data.get('type', 'unknown')}' to {connection_id}: {e}")
            logger.exception("WebSocket Send Exception Details:")
        return False
    except Exception as e:
         logger.error(f"Unexpected error sending message type '{data.get('type', 'unknown')}' to {connection_id}: {e}")
         logger.exception("WebSocket Send Unexpected Exception Details:")
         return False

def send_error_and_end(gateway_client, connection_id, error_text, status_code=500):
    # ... keep existing function ...
    error_data = {'statusCode': status_code, 'type': 'error', 'text': error_text}
    end_data = {'statusCode': status_code, 'type': 'end'}
    send_ws_message(gateway_client, connection_id, error_data)
    send_ws_message(gateway_client, connection_id, end_data)

def knowledge_base_retrieval(prompt, kb_id):
    # ... keep existing function ...
    if not agent_runtime_client:
        logger.error("Bedrock Agent Runtime client not initialized.")
        return {"retrievalResults": []}
    query = {"text": prompt}
    try:
        logger.info(f"Retrieving from Knowledge Base ID: {kb_id} with prompt: '{prompt}'")
        kb_response = agent_runtime_client.retrieve(
            knowledgeBaseId=kb_id,
            retrievalQuery=query,
            retrievalConfiguration={
                'vectorSearchConfiguration': {
                    'numberOfResults': 3 # Example: retrieve top 3 results
                }
            }
        )
        logger.info(f"KB Response received (first 500 chars): {str(kb_response)[:500]}")
        return kb_response
    except ClientError as e:
        logger.error(f"Error during Knowledge Base retrieval: {e}")
        logger.exception("Knowledge Base Retrieve ClientError Details:")
        return {"retrievalResults": []}
    except Exception as e:
        logger.error(f"Unexpected error during Knowledge Base retrieval: {e}")
        logger.exception("Knowledge Base Retrieve Unexpected Exception Details:")
        return {"retrievalResults": []}

def extract_sources(kb_results):
    # ... keep existing function ...
    logger.info(f"Extracting and filtering sources from KB results (first 500 chars): {str(kb_results)[:500]}")
    best_sources_by_uri = {}
    for result in kb_results.get('retrievalResults', []):
        location = result.get("location", {})
        metadata = result.get("metadata", {})
        score = result.get('score')
        try:
            current_score = float(score) if score is not None else 0.0
        except (ValueError, TypeError):
            current_score = 0.0

        source_uri = None
        if location.get("type") == "S3":
            source_uri = location.get("s3Location", {}).get("uri")

        if source_uri:
            page_number = metadata.get('x-amz-bedrock-kb-document-page-number')
            try:
                page_number = float(page_number) if page_number is not None else None
            except (ValueError, TypeError):
                logger.warning(f"Could not convert page number '{page_number}' to float for {source_uri}")
                page_number = None

            processed_uri = re.sub(r'^s3://([^/]+)/(.*)', r'https://\1.s3.amazonaws.com/\2', source_uri)
            current_source_info = {
                "url": processed_uri,
                "score": current_score,
                "_s3_uri": source_uri
            }
            if page_number is not None:
                current_source_info["page"] = page_number

            existing_best_score = best_sources_by_uri.get(source_uri, {}).get("score", -1.0)
            if current_score > existing_best_score:
                logger.debug(f"Updating best source for {source_uri} with score {current_score} (previous: {existing_best_score})")
                best_sources_by_uri[source_uri] = current_source_info
            else:
                logger.debug(f"Ignoring source for {source_uri} with score {current_score} (best score is {existing_best_score})")
        else:
            logger.warning(f"Could not extract source_uri from result: {result}")

    deduplicated_sources = list(best_sources_by_uri.values())
    deduplicated_sources.sort(key=lambda x: x.get('score', 0.0), reverse=True)
    for source in deduplicated_sources:
        source.pop('_s3_uri', None)
    logger.info(f"Filtered and processed unique sources: {deduplicated_sources}")
    return deduplicated_sources


def is_relevant(sources):
    # ... keep existing function ...
    if not sources:
        return False
    top_score = sources[0].get('score', 0)
    return top_score > 0.4

def transform_history(history, limit=25):
    # ... keep existing function ...
    transformed = []
    last_role = None
    logger.info(f"Transforming raw history (last {limit} entries): {history[-limit:]}")
    for entry in history[-limit:]:
        message_type = entry.get('type')
        message_content = entry.get('message', '').strip()
        sent_by = entry.get('sentBy')
        if not message_type or not sent_by or (message_type == 'TEXT' and not message_content):
            logger.debug(f"Skipping invalid or empty history entry: {entry}")
            continue
        if message_type == 'SOURCES':
            logger.debug(f"Ignoring SOURCES entry for history transformation: {entry}")
            continue
        if message_type == 'TEXT':
            role = 'user' if sent_by == 'USER' else 'assistant'
            if role == 'user' and last_role == 'user':
                logger.debug("Merging consecutive user message.")
                if transformed and 'content' in transformed[-1] and transformed[-1]['content']:
                    transformed[-1]['content'][0]['text'] += f"\n{message_content}"
                else:
                    transformed.append({"role": role, "content": [{"text": message_content}]})
                continue
            elif role == 'assistant' and last_role == 'assistant':
                logger.debug("Skipping consecutive assistant message.")
                continue
            transformed.append({ "role": role, "content": [{"text": message_content}] })
            last_role = role
            logger.debug(f"Added history message: Role={role}, Content='{message_content[:50]}...'")
        else:
            logger.debug(f"Ignoring message type '{message_type}' for history transformation.")

    if transformed and transformed[0]['role'] == 'assistant':
        logger.warning("History transformation started with 'assistant', removing first entry.")
        transformed.pop(0)
    if transformed and transformed[-1]['role'] == 'assistant':
        logger.warning("History transformation ended with 'assistant', removing last entry.")
        transformed.pop()
    logger.info(f"Result of transform_history: {transformed}")
    return transformed


# --- Main Lambda Handler ---
def lambda_handler(event, context):
    logger.info(f"Received event: {json.dumps(event)}")

    connectionId = event.get("connectionId")
    prompt = event.get("prompt") # Current user prompt
    history_raw = event.get("history", [])
    selected_role_key = event.get("role", "researchAssistant")

    # --- Initialize API Gateway Client ---
    websocket_callback_url = os.environ.get('URL')
    gateway_client = None
    if websocket_callback_url:
        try:
            gateway_client = boto3.client("apigatewaymanagementapi", endpoint_url=websocket_callback_url)
        except Exception as e:
            logger.error(f"Failed to create ApiGatewayManagementApi client with endpoint {websocket_callback_url}: {e}")
    else:
        logger.error("Environment variable 'URL' (WebSocket Callback URL) is not set.")
        return {'statusCode': 500, 'body': json.dumps({'error': 'Server configuration error (Callback URL missing).'})}

    # --- Input Validation ---
    if not connectionId:
        logger.error("Missing 'connectionId' in event.")
        return {'statusCode': 400, 'body': json.dumps({'error': 'Missing connectionId.'})}
    # We might allow empty prompts later if file context is primary, but for now, require a prompt for most actions
    # if not prompt:
    #     logger.warning("Prompt is empty.")
        # Decide if you want to handle this - send error or proceed?
        # send_error_and_end(gateway_client, connectionId, "No prompt provided.", 400)
        # return {'statusCode': 400, 'body': json.dumps({'error': 'No prompt provided.'})}


    # **************************************************************** #
    # *** NEW: Check for Quantitative Count Query                  *** #
    # **************************************************************** #
    is_count_query = False
    if prompt: # Only check if prompt is not None or empty
        prompt_lower = prompt.lower()
        # Simple keyword-based detection - can be expanded later
        count_query_keywords = [
            "how many papers", "count papers", "number of papers",
            "in how many documents", "list the papers containing", "list documents with"
        ]
        # Check for phrases like "how many papers mention X", "in how many papers does Y appear"
        if any(phrase in prompt_lower for phrase in count_query_keywords):
             is_count_query = True
        elif "how many" in prompt_lower and ("appear" in prompt_lower or "contain" in prompt_lower or "mention" in prompt_lower):
             is_count_query = True
        # Add more sophisticated checks if needed (e.g., regex, checking for specific word + count indicator)

    if is_count_query:
        logger.info(f"Detected quantitative/count query: '{prompt}'")

        # Log a tracking object to CloudWatch Logs
        tracking_object = {
            "query_type": "quantitative_count_detected",
            "original_prompt": prompt,
            "connection_id": connectionId,
            "timestamp_utc": datetime.datetime.utcnow().isoformat() # Added timestamp
        }
        logger.info(f"COUNT_QUERY_TRACKING: {json.dumps(tracking_object)}") # Make the log easy to find

        # Send placeholder response to frontend
        response_text = "This looks like a count question. Actual counting feature is under development."
        response_data = {'statusCode': 200, 'type': 'text', 'text': response_text}
        send_ws_message(gateway_client, connectionId, response_data)

        # Send end signal
        end_data = {'statusCode': 200, 'type': 'end'}
        send_ws_message(gateway_client, connectionId, end_data)

        logger.info("Sent placeholder response for count query and finished.")
        # Return successfully, bypassing the rest of the RAG/LLM flow
        return {'statusCode': 200, 'body': json.dumps({'message': 'Handled count query with placeholder.'})}
    # **************************************************************** #
    # *** END NEW CHECK                                            *** #
    # **************************************************************** #


    # --- Direct Handling for "List Countries" Query (Keep Existing Logic) ---
    if prompt: # Re-check prompt exists for this block too
        prompt_lower = prompt.lower()
        country_query_phrases = [
            "what countries", "which countries", "country coverage", "countries covered",
            "countries do you have", "list of countries", "available countries"
        ]
        if any(phrase in prompt_lower for phrase in country_query_phrases):
            logger.info(f"Detected country list query: '{prompt}'")
            try:
                sorted_countries = sorted(list(SUPPORTED_COUNTRIES))
                formatted_countries = ", ".join(c.title() for c in sorted_countries)
                response_text = f"Based on the documents currently available, I have information related to the following countries: {formatted_countries}."
                response_data = {'statusCode': 200, 'type': 'text', 'text': response_text}
                send_ws_message(gateway_client, connectionId, response_data)
                end_data = {'statusCode': 200, 'type': 'end'}
                send_ws_message(gateway_client, connectionId, end_data)
                logger.info("Successfully handled country list request directly.")
                return {'statusCode': 200, 'body': json.dumps({'message': 'Handled country list request directly.'})}
            except Exception as e:
                logger.error(f"Error formatting or sending country list: {e}")
                send_error_and_end(gateway_client, connectionId, "Sorry, I encountered an error trying to list the countries.", 500)
                return {'statusCode': 500, 'body': json.dumps({'error': 'Error handling country list request.'})}


    # --- If NOT a count query or country list query, proceed with normal RAG/LLM flow ---

    # --- Environment Variable Check (KB_ID) ---
    kb_id = os.environ.get('KNOWLEDGE_BASE_ID')
    if not kb_id:
        logger.error("Environment variable 'KNOWLEDGE_BASE_ID' is not set.")
        send_error_and_end(gateway_client, connectionId, "Server configuration error (KB ID missing).", 500)
        return {'statusCode': 500, 'body': json.dumps({'error': 'Server configuration error (KB ID missing).'})}

    # --- History Validation ---
    if not isinstance(history_raw, list):
        logger.warning(f"Received 'history' is not a list (type: {type(history_raw)}). Using empty history.")
        history = []
    else:
        history = history_raw

    # --- KB Retrieval ---
    rag_info = ""
    sources = []
    is_kb_relevant = False
    if prompt: # Only query KB if there is a prompt (redundant check, but safe)
        kb_search_term = prompt
        try:
            kb_response = knowledge_base_retrieval(kb_search_term, kb_id)
            sources = extract_sources(kb_response)
            is_kb_relevant = is_relevant(sources)
            if is_kb_relevant:
                logger.info("KB results are relevant. Preparing RAG context.")
                rag_info = "\n\n".join(
                    result.get("content", {}).get("text", "")
                    for result in kb_response.get("retrievalResults", [])
                    if result.get("content", {}).get("text")
                ).strip()
            else:
                logger.info("KB results are not relevant or no sources found.")
        except Exception as kb_e:
            logger.error(f"An error occurred during KB processing: {kb_e}")
            is_kb_relevant = False
            rag_info = ""
            sources = []
    else:
        logger.info("Skipping KB retrieval as prompt is empty.")


    # --- Prepare Messages for Bedrock ---
    try:
        transformed_history = transform_history(history)
    except Exception as hist_e:
        logger.error(f"Error during history transformation: {hist_e}")
        logger.exception("History Transformation Exception Details:")
        send_error_and_end(gateway_client, connectionId, "Error processing chat history.", 500)
        return {'statusCode': 500, 'body': json.dumps({'error': 'Error processing chat history.'})}

    current_user_prompt = prompt if prompt else " " # Use space if prompt was empty

    # --- Construct Final Prompt Text (Handle RAG) ---
    llm_prompt_text = current_user_prompt
    if is_kb_relevant and rag_info:
        logger.info(f"Augmenting current prompt with RAG context for role {selected_role_key}.")
        rag_prefix = ""
        if selected_role_key == "researchAssistant":
             rag_prefix = f"""Knowledge Source Information:
---
{rag_info}
---

Based ONLY on the information above, answer the user's question: """
        else:
              rag_prefix = f"""Use the following information if relevant to answer the user's question:
Knowledge Source Information:
---
{rag_info}
---

User's question: """
        llm_prompt_text = f"{rag_prefix}{current_user_prompt}"

    # --- Combine History and Current Prompt ---
    messages_for_api = transformed_history
    messages_for_api.append({
        "role": "user",
        "content": [{"text": llm_prompt_text}]
    })

    # --- Set System Prompt for Bedrock ---
    persona = BOT_PERSONAS.get(selected_role_key, BOT_PERSONAS["default"])
    system_prompt_text = persona["prompt"]
    bot_name = persona["name"]
    logger.info(f"Selected Bot Persona: {bot_name} (Key: {selected_role_key})")
    system_prompts = [{"text": system_prompt_text}] if system_prompt_text else None

    logger.info(f"Sending query to LLM. System Prompt[:100]: '{system_prompt_text[:100]}...'. Messages: {json.dumps(messages_for_api)}")

    # --- Invoke Bedrock & Stream Response ---
    if not bedrock_runtime_client:
        logger.error("Bedrock Runtime client not initialized. Cannot call Converse API.")
        send_error_and_end(gateway_client, connectionId, "Server error (Bedrock client unavailable).", 500)
        return {'statusCode': 500, 'body': json.dumps({'error': 'Server error (Bedrock client unavailable).'})}

    response = None
    stream = None
    stream_finished_normally = False
    full_response_text = ""

    try:
        response = bedrock_runtime_client.converse_stream(
            modelId="anthropic.claude-3-5-sonnet-20240620-v1:0",
            messages=messages_for_api,
            system=system_prompts,
        )
        logger.info("Received stream response from Bedrock Converse API.")
        stream = response.get('stream')

        if stream:
            logger.info("Processing stream...")
            for event in stream:
                block_type = "unknown"
                message_text = ""

                if 'messageStart' in event:
                    logger.debug(f"Stream message start: Role = {event['messageStart'].get('role')}")
                    block_type = "start"
                elif 'contentBlockDelta' in event:
                    block_type = "delta"
                    delta = event['contentBlockDelta']['delta']
                    if 'text' in delta:
                        message_text = delta['text']
                        if message_text:
                            full_response_text += message_text
                            delta_data = {'statusCode': 200, 'type': block_type, 'text': message_text}
                            if not send_ws_message(gateway_client, connectionId, delta_data):
                                logger.warning("Stopping stream processing as WebSocket send failed (client likely disconnected).")
                                break
                elif 'messageStop' in event:
                    stop_reason = event['messageStop'].get('stopReason')
                    logger.info(f"Stream message stop. Reason: {stop_reason}")
                    stream_finished_normally = True
                elif 'metadata' in event:
                    logger.debug(f"Stream metadata received: {event['metadata']}")
                    if event['metadata'].get('stopReason'):
                        stream_finished_normally = True
                    break # Assume safe to break after metadata
                elif 'contentBlockStop' in event:
                     logger.debug("Stream content block stop event received.")
                else:
                    unhandled_key = list(event.keys())[0] if event else "None"
                    logger.warning(f"Unhandled stream event type/key: {unhandled_key}")

            # --- After stream processing loop ---
            logger.info(f"Finished processing stream loop. Stream finished normally: {stream_finished_normally}")
            logger.info(f"Full response text accumulated: {full_response_text[:500]}...")

            # Send sources only if relevant and found earlier
            if is_kb_relevant and sources:
                sources_data = {'statusCode': 200, 'type': 'sources', 'sources': sources}
                send_ws_message(gateway_client, connectionId, sources_data)

            # Send end signal
            status_code = 200 if stream_finished_normally else 500
            end_data = {'statusCode': status_code, 'type': 'end'}
            if not stream_finished_normally:
                end_data['reason'] = 'Stream did not report a normal stop reason.'
            send_ws_message(gateway_client, connectionId, end_data)

        else:
            logger.error("No 'stream' object found in Bedrock Converse API response.")
            send_error_and_end(gateway_client, connectionId, "LLM response error (no stream).", 500)
            return {'statusCode': 500, 'body': json.dumps({'error': 'Bedrock response missing stream.'})}

    except ClientError as e:
        error_text = f'LLM API Error: {type(e).__name__} - {e}'
        logger.error(error_text)
        logger.exception("Bedrock Converse API ClientError Details:")
        send_error_and_end(gateway_client, connectionId, f'LLM API Error: {type(e).__name__}', 500)
        return {'statusCode': 500, 'body': json.dumps({'error': error_text})}
    except Exception as e:
        error_text = f'Error during LLM interaction: {type(e).__name__} - {e}'
        logger.error(error_text)
        logger.exception("LLM Interaction Unexpected Exception Details:")
        send_error_and_end(gateway_client, connectionId, f'Error during LLM interaction: {type(e).__name__}', 500)
        return {'statusCode': 500, 'body': json.dumps({'error': error_text})}

    logger.info("Successfully processed request and streamed response or handled error.")
    return {'statusCode': 200, 'body': json.dumps({'message': 'Message processed successfully'})}