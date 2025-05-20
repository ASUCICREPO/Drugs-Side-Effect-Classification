# /home/zvallarino/AI_AWS_PC/Drugs-Side-Effect-Classification/cdk_backend/lambda/lambdaXbedrock/index.py

import os
import json
import boto3
import re
import logging
import datetime
from botocore.exceptions import ClientError
import urllib.parse
import time
import random

# --- Opensearch Import ---
try:
    from opensearchpy import OpenSearch, RequestsHttpConnection, AWSV4SignerAuth
    OPENSEARCH_PY_AVAILABLE = True
    logging.info("Successfully imported opensearchpy.")
except ImportError:
    OPENSEARCH_PY_AVAILABLE = False
    logging.warning("opensearchpy library not found. Count queries will be disabled.")
    class OpenSearch: pass
    class RequestsHttpConnection: pass
    class AWSV4SignerAuth: pass

# Configure logging
logger = logging.getLogger()
# Set log level based on environment variable, default to INFO
LOG_LEVEL = os.environ.get('LOG_LEVEL', 'INFO').upper()
try:
    logger.setLevel(LOG_LEVEL)
    logging.info(f"Log level set to {LOG_LEVEL}")
except ValueError:
    logger.setLevel(logging.INFO)
    logging.warning(f"Invalid LOG_LEVEL '{LOG_LEVEL}'. Defaulting to INFO.")


# --- Constants ---
SUPPORTED_COUNTRIES = {
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
    "suriname", "tanzania", "lao pdr", "laos", # <<< Include common variations
    "timor-leste", "togo", "tunisia", "türkiye", "turkey", # <<< Include variations
    "turkmenistan", "uganda", "ukraine", "bhutan", "bangladesh", "uzbekistan",
    "vanuatu", "vietnam", "west bank and gaza", "zambia", "zimbabwe"
}

BOT_PERSONAS = {
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
# --- End Constants ---

# --- Environment Variables ---
lambda_region = os.environ.get('AWS_REGION', 'us-east-1')
OPENSEARCH_ENDPOINT = os.environ.get('OPENSEARCH_ENDPOINT')
OPENSEARCH_INDEX = os.environ.get('OPENSEARCH_INDEX')
# Field containing the main text content in OpenSearch
OPENSEARCH_TEXT_FIELD = os.environ.get('OPENSEARCH_TEXT_FIELD', 'AMAZON_BEDROCK_TEXT_CHUNK') # Default to standard KB field
# Field uniquely identifying the source document in OpenSearch (often the S3 URI)
OPENSEARCH_DOC_ID_FIELD = os.environ.get('OPENSEARCH_DOC_ID_FIELD', 'AMAZON_BEDROCK_METADATA_source-uri.keyword') # Default to standard KB metadata field (use .keyword for aggregation)
# Field for page number metadata in OpenSearch
OPENSEARCH_PAGE_FIELD = os.environ.get('OPENSEARCH_PAGE_FIELD', 'AMAZON_BEDROCK_METADATA_document-page-number') # Default to standard KB metadata field

KNOWLEDGE_BASE_ID = os.environ.get('KNOWLEDGE_BASE_ID')
WEBSOCKET_CALLBACK_URL = os.environ.get('URL')
S3_BUCKET_NAME = os.environ.get('S3_BUCKET_NAME')
LLM_MODEL_ID = os.environ.get('LLM_MODEL_ID', "anthropic.claude-3-5-sonnet-20240620-v1:0") # Allow override, default to Sonnet 3.5

# --- End Environment Variables ---

# --- Initialize Clients ---
agent_runtime_client = None
try:
    agent_runtime_client = boto3.client("bedrock-agent-runtime", region_name=lambda_region)
    logger.info("Bedrock Agent Runtime client initialized.")
except Exception as e:
    logger.error(f"Error initializing bedrock-agent-runtime client: {e}", exc_info=True)

bedrock_runtime_client = None
try:
    bedrock_runtime_client = boto3.client(service_name="bedrock-runtime", region_name=lambda_region)
    logger.info("Bedrock Runtime client initialized.")
except Exception as e:
    logger.error(f"Error initializing bedrock-runtime client: {e}", exc_info=True)

# --- Initialize OpenSearch Client ---
opensearch_client = None
if OPENSEARCH_PY_AVAILABLE and OPENSEARCH_ENDPOINT and '.aoss.' in OPENSEARCH_ENDPOINT: # Check if it's likely an AOSS endpoint
    try:
        logger.info(f"Initializing OpenSearch client for AOSS endpoint: {OPENSEARCH_ENDPOINT}")
        credentials = boto3.Session().get_credentials()
        auth = AWSV4SignerAuth(credentials, lambda_region, 'aoss') # Use 'aoss' service name

        # Remove https:// prefix for the host parameter
        host = OPENSEARCH_ENDPOINT.replace('https://', '')

        opensearch_client = OpenSearch(
            hosts=[{'host': host, 'port': 443}], # Connect via HTTPS
            http_auth=auth,
            use_ssl=True,
            verify_certs=True,
            connection_class=RequestsHttpConnection,
            pool_maxsize=20,
            timeout=30
        )
        # Verify connection (optional but recommended)
        if opensearch_client.ping():
             logger.info("OpenSearch AOSS client ping successful.")
        else:
             logger.warning("OpenSearch AOSS client ping failed. Client might still work.")

    except Exception as e:
        logger.error(f"Error initializing OpenSearch AOSS client: {e}", exc_info=True)
        opensearch_client = None # Ensure client is None if initialization fails
elif OPENSEARCH_PY_AVAILABLE and OPENSEARCH_ENDPOINT: # Handle non-AOSS endpoints (e.g., EC2-based OS/Elasticsearch with standard auth if needed)
     # Note: This section might need adjustments based on the specific auth method
     # for non-AOSS clusters (e.g., basic auth, different IAM setup).
     # Assuming IAM auth via AWSV4SignerAuth with 'es' service name for older clusters.
    try:
        logger.info(f"Initializing OpenSearch client for standard endpoint: {OPENSEARCH_ENDPOINT}")
        credentials = boto3.Session().get_credentials()
        # Use 'es' for older Elasticsearch/OpenSearch Service domains
        auth = AWSV4SignerAuth(credentials, lambda_region, 'es')

        # Remove https:// prefix for the host parameter
        host = OPENSEARCH_ENDPOINT.replace('https://', '')

        opensearch_client = OpenSearch(
            hosts=[{'host': host, 'port': 443}],
            http_auth=auth,
            use_ssl=True,
            verify_certs=True,
            connection_class=RequestsHttpConnection,
            pool_maxsize=20,
            timeout=30
        )
        if opensearch_client.ping():
             logger.info("OpenSearch standard client ping successful.")
        else:
             logger.warning("OpenSearch standard client ping failed.")
    except Exception as e:
        logger.error(f"Error initializing standard OpenSearch client: {e}", exc_info=True)
        opensearch_client = None
elif not OPENSEARCH_PY_AVAILABLE:
    logger.warning("OpenSearch client cannot be initialized because opensearchpy library is not available.")
else: # OPENSEARCH_ENDPOINT is missing
    logger.warning("OpenSearch endpoint not configured. Count queries will be disabled.")

# --- Initialize S3 Client ---
s3_client = None
try:
    s3_client = boto3.client('s3')
    logger.info("S3 client initialized.")
except Exception as e:
    logger.error(f"Error initializing S3 client: {e}", exc_info=True)
# --- End Client Initialization ---


# --- Helper Functions ---

# --- Helper Function for LLM call with Retry Logic ---
def invoke_llm_with_retry(
    client, model_id, messages, system_prompts,
    max_attempts=4, # 1 initial try + 3 retries
    base_wait_sec=1 # Initial wait time in seconds
    ):
    """
    Invokes the Bedrock ConverseStream API with retry logic for ThrottlingException.
    Uses exponential backoff with jitter.
    """
    if not client:
        logger.error("invoke_llm_with_retry: Bedrock Runtime client is not available.")
        raise ValueError("Bedrock Runtime client not initialized.")

    response = None
    last_exception = None

    for attempt in range(max_attempts):
        logger.info(f"LLM API call attempt {attempt + 1}/{max_attempts}...")
        try:
            response = client.converse_stream(
                modelId=model_id,
                messages=messages,
                system=system_prompts,
                inferenceConfig={"maxTokens": 2048, "stopSequences": ["</knowledge_source>"]} # Add stop sequence
            )
            logger.info(f"LLM API call attempt {attempt + 1} successful.")
            return response # Return successful response immediately

        except ClientError as e:
            last_exception = e
            if e.response.get('Error', {}).get('Code') == 'ThrottlingException':
                logger.warning(f"LLM API call attempt {attempt + 1} throttled.")
                if attempt < max_attempts - 1:
                    # Calculate wait time: base * (2^attempt) + random jitter (0-0.5s)
                    wait_time = base_wait_sec * (2**attempt) + random.uniform(0, 0.5)
                    logger.info(f"Waiting {wait_time:.2f} seconds before retry...")
                    time.sleep(wait_time)
                    continue # Go to the next attempt
                else:
                    logger.error(f"LLM API call failed after {max_attempts} attempts due to throttling.")
                    raise e # Re-raise the final ThrottlingException if max retries reached
            else:
                # It's a different ClientError, don't retry, re-raise immediately
                logger.error(f"Non-throttling Bedrock ClientError on attempt {attempt + 1}: {e}", exc_info=True)
                raise e
        except Exception as e:
            # Catch any other unexpected error during the API call itself
            last_exception = e
            logger.error(f"Unexpected error during LLM API call attempt {attempt + 1}: {e}", exc_info=True)
            raise e # Re-raise unexpected errors immediately

    # Should not be reached if successful response or exception occurred, but as fallback:
    logger.error("invoke_llm_with_retry finished loop without success or re-raising.")
    if last_exception: raise last_exception # Re-raise the last known exception
    raise RuntimeError("LLM call failed after multiple retries without specific exception.") # Generic fallback
# --- End Helper Function ---

# --- Helper function to detect a single supported country ---
def extract_single_country(prompt_lower, supported_countries_set):
    """
    Checks if the prompt contains exactly one country from the supported set.
    Uses word boundaries to avoid partial matches.
    Returns the lowercase country name if exactly one is found, otherwise None.
    """
    found_countries = set()
    # Add word boundaries (\b) to prevent matching substrings (e.g., 'niger' in 'nigeria')
    # Iterate through the known list to build specific patterns
    for country in supported_countries_set:
        # Create a regex pattern for the country name as a whole word
        # Handle potential special characters in country names if necessary (e.g., Côte d'Ivoire) by escaping them
        pattern = r"\b" + re.escape(country) + r"\b"
        if re.search(pattern, prompt_lower):
            found_countries.add(country)

    if len(found_countries) == 1:
        the_country = found_countries.pop()
        logger.info(f"Exactly one supported country detected: '{the_country}'")
        return the_country # Return the single country found
    elif len(found_countries) > 1:
        logger.info(f"Multiple supported countries detected: {found_countries}. Not treating as single country query.")
        return None
    else:
        logger.debug("No specific supported country detected in prompt.") # Optional debug log
        return None
# --- End Helper Function ---

# --- Helper Function to Extract Comparison Entities ---
def extract_comparison_entities(prompt_lower):
    """Attempts to extract two entities from a comparison prompt."""
    # Basic patterns: "compare X and Y", "between X and Y", "X vs Y", "X versus Y"
    # Looking for entities often followed by "policies", "policy", or end of string
    patterns = [
        r"compare\s+(.*?)\s+and\s+(.*?)(?:\s+policies|\s+policy|$)", # require space separation
        r"between\s+(.*?)\s+and\s+(.*?)(?:\s+policies|\s+policy|$)",
        r"(.*?)\s+versus\s+(.*?)(?:\s+policies|\s+policy|$)",
        r"(.*?)\s+vs\.?\s+(.*?)(?:\s+policies|\s+policy|$)", # Added optional period for vs.
        r"difference between\s+(.*?)\s+and\s+(.*?)(?:\s+policies|\s+policy|$)" # Added difference pattern
    ]
    entities = None
    for pattern in patterns:
        match = re.search(pattern, prompt_lower)
        if match:
            # Try to capture potentially longer phrases for entities
            group1 = match.group(1).strip()
            group2 = match.group(2).strip()
            # Basic validation: Ensure they aren't excessively long or just stop words
            if group1 and group2 and len(group1) < 100 and len(group2) < 100: # Arbitrary length limit
                 # Further refine: remove leading/trailing common words if they don't make sense alone
                 common_starts = ["the ", "a ", "an "]
                 for start in common_starts:
                     if group1.startswith(start) and len(group1.split()) > 1: group1 = group1[len(start):]
                     if group2.startswith(start) and len(group2.split()) > 1: group2 = group2[len(start):]

                 entities = [group1, group2]
                 logger.debug(f"Pattern '{pattern}' matched. Entities: {entities}")
                 break # Use the first pattern that matches

    if not entities:
        logger.info(f"Could not extract entities using primary comparison patterns from: '{prompt_lower}'")
        return None

    # Basic cleanup (remove possessives often included, extra whitespace)
    cleaned_entities = [e.replace("'s", "").strip().rstrip('.?,!') for e in entities] # More robust cleaning

    # Ensure we got two non-empty entities
    if len(cleaned_entities) == 2 and all(cleaned_entities):
        logger.info(f"Extracted comparison entities: {cleaned_entities}")
        return cleaned_entities
    else:
        logger.warning(f"Failed to extract two valid entities after cleaning from: '{prompt_lower}' -> Raw: {entities}, Cleaned: {cleaned_entities}")
        return None
# --- End Helper Function ---

# --- Helper Function to Combine and Prepare Sources ---
def prepare_combined_sources(list_of_retrieval_results, s3_client, bucket_name):
    """
    Combines sources from multiple retrieval results, de-duplicates by S3 URI
    (keeping highest score), and generates pre-signed URLs.
    """
    combined_sources_metadata_dict = {} # Use dict for efficient de-duplication by URI

    if not list_of_retrieval_results:
        logger.warning("prepare_combined_sources called with empty results list.")
        return []

    for results in list_of_retrieval_results: # Iterate through results for each entity query
        if not results or 'retrievalResults' not in results:
            logger.debug("Skipping empty or invalid retrieval result set.")
            continue

        logger.info(f"Processing {len(results['retrievalResults'])} chunks from a retrieval result set.")
        for chunk in results['retrievalResults']:
            try:
                s3_uri = chunk.get('location', {}).get('s3Location', {}).get('uri')
                if not s3_uri:
                    logger.debug(f"Skipping chunk with no S3 URI: {chunk.get('chunkId', 'N/A')}")
                    continue # Skip if no URI

                score = chunk.get('score')
                try: current_score = float(score) if score is not None else 0.0
                except (ValueError, TypeError): current_score = 0.0

                # Check if we already have this URI, and if the current chunk has a higher score
                existing_entry = combined_sources_metadata_dict.get(s3_uri)
                if existing_entry and existing_entry.get('score', -1.0) >= current_score:
                    logger.debug(f"Skipping chunk for {s3_uri} - existing score ({existing_entry.get('score')}) is higher or equal to current ({current_score}).")
                    continue # Skip if existing score is better or equal

                # --- Process this chunk (New URI or better score) ---
                page_number_str = chunk.get('metadata', {}).get('x-amz-bedrock-kb-document-page-number') # Use standard KB metadata key
                page_number = None
                if page_number_str:
                     try: page_number = int(page_number_str)
                     except (ValueError, TypeError): logger.warning(f"Could not convert page number '{page_number_str}' for {s3_uri}")

                text_chunk_preview = chunk.get('content', {}).get('text', '')[:50] # Short preview for logging

                # Generate pre-signed URL (handle potential errors)
                presigned_url = None
                if s3_client and bucket_name and s3_uri.startswith(f"s3://{bucket_name}/"):
                    try:
                        s3_key = s3_uri.split(f"s3://{bucket_name}/", 1)[1]
                        presigned_url = s3_client.generate_presigned_url(
                            'get_object',
                            Params={'Bucket': bucket_name, 'Key': s3_key},
                            ExpiresIn=3600 # 1 hour
                        )
                        logger.debug(f"Generated presigned URL for {s3_uri}")
                    except Exception as e:
                        logger.error(f"Failed to generate presigned URL for {s3_uri} in combined sources: {e}")
                        # Fallback to basic HTTPS URL if pre-signing fails but URI is valid S3
                        presigned_url = re.sub(r'^s3://([^/]+)/(.*)', r'https://\1.s3.amazonaws.com/\2', s3_uri)

                elif s3_uri.startswith('s3://'): # If S3 URI but doesn't match bucket or client missing
                    if not (s3_client and bucket_name):
                         logger.warning(f"Cannot generate presigned URL for {s3_uri} - S3 client or bucket name missing. Using standard HTTPS URL.")
                    else: # URI prefix didn't match
                         logger.warning(f"Source URI {s3_uri} does not match configured bucket {bucket_name}. Using standard HTTPS URL.")
                    presigned_url = re.sub(r'^s3://([^/]+)/(.*)', r'https://\1.s3.amazonaws.com/\2', s3_uri)
                else: # Not an S3 URI or unrecognized format
                     presigned_url = s3_uri # Use the original URI as the 'URL'

                # Store relevant info in the dictionary, overwriting if score is better
                source_info = {
                    "url": presigned_url, # Use the generated/fallback URL or original URI
                    "score": current_score,
                    "_s3_uri_internal": s3_uri # Keep original for potential future use if needed
                }
                if page_number is not None:
                    source_info["page"] = page_number

                logger.debug(f"Updating/Adding source for {s3_uri} (Score: {current_score}, Page: {page_number}, Preview: '{text_chunk_preview}...')")
                combined_sources_metadata_dict[s3_uri] = source_info

            except Exception as e:
                logger.error(f"Error processing chunk in combined sources: {e}. Chunk: {chunk}", exc_info=True)

    # Convert dict values to list and sort by score descending
    final_sources_list = list(combined_sources_metadata_dict.values())
    final_sources_list.sort(key=lambda x: x.get('score', 0), reverse=True)

    # Clean up internal field before returning
    for source in final_sources_list:
         source.pop('_s3_uri_internal', None)

    logger.info(f"Prepared {len(final_sources_list)} combined and de-duplicated sources.")
    logger.debug(f"Final combined sources list: {final_sources_list}")
    return final_sources_list
# --- End Helper Function ---


def get_clean_filename(s3_uri):
    """Extracts and cleans the filename from an S3 URI."""
    if not s3_uri or not isinstance(s3_uri, str):
        return "Unknown Source"
    try:
        # Handle both s3:// and https:// formats if pre-signing failed or wasn't used
        if s3_uri.startswith("s3://"):
            path = s3_uri.split('/', 3)[-1] # Get part after bucket name
        elif s3_uri.startswith("https://"):
            # More careful parsing for https URLs to avoid issues with query params etc.
            parsed_url = urllib.parse.urlparse(s3_uri)
            path = parsed_url.path.lstrip('/') # Get path part, remove leading /
        else:
            path = s3_uri # Assume it might just be a path/filename

        # Get part after the last '/' in the path
        filename_encoded = path.split('/')[-1]

        # Decode URL encoding (e.g., %20 -> space)
        filename_decoded = urllib.parse.unquote(filename_encoded)
        return filename_decoded if filename_decoded else "Unknown Source" # Ensure not empty
    except Exception as e:
        logger.error(f"Error cleaning filename from URI '{s3_uri}': {e}")
        # Fallback: return the raw part after last slash if possible
        try:
            return s3_uri.split('/')[-1]
        except:
            return "Unknown Source" # Final fallback

def send_ws_message(gateway_client, connection_id, data):
    """Safely sends a message payload via WebSocket."""
    if not gateway_client:
        logger.error(f"Cannot send message to {connection_id}: gateway_client not available.")
        return False
    if not connection_id:
        logger.error("Cannot send message: connection_id is missing.")
        return False
    try:
        payload = json.dumps(data)
        logger.debug(f"Attempting to send to {connection_id}: Type '{data.get('type', 'unknown')}', Size: {len(payload)} bytes") # Log size too
        gateway_client.post_to_connection(ConnectionId=connection_id, Data=payload)
        logger.info(f"Sent message type '{data.get('type', 'unknown')}' to {connection_id}")
        return True
    except ClientError as e:
        if e.response['Error']['Code'] == 'GoneException':
            logger.warning(f"Cannot send message to {connection_id}: Connection is gone (GoneException).")
        elif e.response['Error']['Code'] == 'LimitExceededException':
            logger.warning(f"Rate limit exceeded sending to {connection_id}. Consider backoff/retry or reducing messages.")
        # Handle PayloadTooLargeException specifically
        elif e.response['Error']['Code'] == 'PayloadTooLargeException':
             logger.error(f"Failed to send message to {connection_id}: Payload too large ({len(payload)} bytes). Message Type: '{data.get('type', 'unknown')}'")
             # Potentially send a smaller error message back if this occurs
             try:
                 error_msg = {'statusCode': 413, 'type': 'error', 'text': 'Error: Response data too large to send.'}
                 gateway_client.post_to_connection(ConnectionId=connection_id, Data=json.dumps(error_msg))
             except Exception as inner_e:
                 logger.error(f"Failed even to send the 'PayloadTooLargeException' error message back to {connection_id}: {inner_e}")
        else:
            # Log the full error for other ClientErrors
            logger.error(f"API Gateway Management API ClientError sending message type '{data.get('type', 'unknown')}' to {connection_id}: {e}", exc_info=True)
        return False
    except Exception as e:
        logger.error(f"Unexpected error sending message type '{data.get('type', 'unknown')}' to {connection_id}: {e}", exc_info=True)
        return False


def send_error_and_end(gateway_client, connection_id, error_text, status_code=500):
    """Sends both an error message and an end signal."""
    logger.info(f"Sending error ('{error_text}') and end signal to {connection_id}")
    error_data = {'statusCode': status_code, 'type': 'error', 'text': error_text}
    end_data = {'statusCode': status_code, 'type': 'end'}
    # Attempt to send both, even if one fails
    send_ws_message(gateway_client, connection_id, error_data)
    # Ensure end signal is always sent if possible
    send_ws_message(gateway_client, connection_id, end_data)


def knowledge_base_retrieval(prompt, kb_id, number_of_results=5, filter_dict=None): # Added number_of_results param
    """Retrieves information from the Knowledge Base, optionally applying a filter."""
    if not agent_runtime_client:
        logger.error("Bedrock Agent Runtime client not initialized for KB retrieval.")
        return None
    if not kb_id:
        logger.error("Knowledge Base ID is missing for retrieval.")
        return None

    query = {"text": prompt}
    # Start with the base configuration, including default number of results
    config = {
        'vectorSearchConfiguration': {
            'numberOfResults': number_of_results # Use parameter
        }
    }

    # --- Add filter to the config dictionary IF it was provided ---
    if filter_dict:
        config['vectorSearchConfiguration']['filter'] = filter_dict
        logger.info(f"Applying filter to KB retrieval: {json.dumps(filter_dict)}")
    else:
        logger.info("No filter applied to KB retrieval.")
    # --- End filter addition ---

    try:
        logger.info(f"Retrieving {number_of_results} results from KB {kb_id} (Filter Applied: {bool(filter_dict)}) - Prompt: '{prompt[:100]}...'")
        kb_response = agent_runtime_client.retrieve(
            knowledgeBaseId=kb_id,
            retrievalQuery=query,
            retrievalConfiguration=config
        )

        # --- ADD DEBUG LOGGING HERE ---
        if kb_response and kb_response.get('retrievalResults'):
            logger.info("--- RAW Bedrock Retrieve API Response (Sample) ---")
            try:
                # Log the first result in detail for inspection using pretty-printed JSON
                log_sample = json.dumps(kb_response['retrievalResults'][0], indent=2, default=str) # Use default=str for non-serializable types like datetime
                logger.info(f"First Retrieval Result Object:\n{log_sample}")

                # Optionally, log just the metadata keys and page number for the first few results
                for i, result in enumerate(kb_response['retrievalResults'][:3]): # Log first 3
                    page_num = result.get('metadata', {}).get('AMAZON_BEDROCK_METADATA_document-page-number', 'N/A')
                    uri = result.get('location', {}).get('s3Location', {}).get('uri', 'N/A')
                    score = result.get('score', 'N/A')
                    logger.info(f"Result {i}: URI='{uri}', Score={score}, PageMetadata='{page_num}', AllMetadataKeys={list(result.get('metadata', {}).keys())}")

            except Exception as log_e:
                logger.error(f"Error formatting raw response for logging: {log_e}")
                # Fallback to simpler logging if JSON fails
                logger.info(f"Raw Response (fallback, potentially large truncated): {str(kb_response)[:1500]}")
        else:
             logger.info("--- RAW Bedrock Retrieve API Response: No results found or empty results list. ---")
        # --- END DEBUG LOGGING ---

        num_results_retrieved = len(kb_response.get('retrievalResults', []))
        logger.info(f"KB Retrieval returned {num_results_retrieved} results.")
        if num_results_retrieved > 0:
            # Log score of top result for relevance insight
             top_score = kb_response['retrievalResults'][0].get('score')
             logger.debug(f"Top KB result score: {top_score:.4f}")
        logger.debug(f"KB Response Sample (first 500 chars): {str(kb_response)[:500]}")
        return kb_response
    
    except ClientError as e:
        # Check for specific ValidationException related to filtering
        error_code = e.response.get('Error', {}).get('Code')
        error_message = e.response.get('Error', {}).get('Message', '')
        if error_code == 'ValidationException' and 'Filter' in error_message: # More specific check
            logger.error(f"ValidationException during KB retrieval (likely invalid filter field/syntax: {filter_dict}): {e}", exc_info=False)
        elif error_code == 'ResourceNotFoundException':
             logger.error(f"ResourceNotFoundException during KB retrieval - KB ID '{kb_id}' likely does not exist or insufficient permissions: {e}", exc_info=False)
        else:
            logger.error(f"Bedrock ClientError during KB retrieval: {e}", exc_info=True)
        return None # Return None on ClientError
    except Exception as e:
        logger.error(f"Unexpected error during KB retrieval: {e}", exc_info=True)
        return None # Return None on other errors


# --- MODIFIED extract_sources function ---
def extract_sources(kb_results):
    """
    Extracts and formats source URLs (as pre-signed URLs), scores, and page numbers
    from a SINGLE Knowledge Base retrieval result.
    De-duplicates based on the source document URI within this result set,
    keeping only the highest score per document.
    """
    # Check if necessary components are available
    s3_available = s3_client and S3_BUCKET_NAME
    if not s3_available:
        logger.warning("S3 client or bucket name missing. Pre-signed URLs will not be generated.")

    if not kb_results or not isinstance(kb_results.get('retrievalResults'), list):
        logger.warning("extract_sources called with invalid or empty kb_results.")
        return []

    num_chunks = len(kb_results['retrievalResults'])
    logger.info(f"Extracting and filtering sources from {num_chunks} KB result chunks.")

    best_sources_by_uri = {}
    for result in kb_results['retrievalResults']:
        location = result.get("location", {})
        metadata = result.get("metadata", {})
        score = result.get('score')
        text_chunk_preview = result.get("content", {}).get("text", "")[:50] # Short preview for logging

        try: current_score = float(score) if score is not None else 0.0
        except (ValueError, TypeError): current_score = 0.0

        source_uri = None
        page_number = None
        if location.get("type") == "S3":
            source_uri = location.get("s3Location", {}).get("uri") # s3://bucket/key
            # Use standard KB metadata key for page number
            page_number_str = metadata.get('x-amz-bedrock-kb-document-page-number')
            if page_number_str:
                 try: page_number = int(page_number_str)
                 except (ValueError, TypeError): logger.warning(f"Could not convert page number '{page_number_str}' for {source_uri}")

        if source_uri:
            existing_best_score = best_sources_by_uri.get(source_uri, {}).get("score", -1.0)
            if current_score > existing_best_score:
                # --- Generate Pre-signed URL ---
                final_url = source_uri # Default to original URI
                # Check if s3 client and bucket name are available AND if the URI matches the expected bucket
                if s3_available and source_uri.startswith(f"s3://{S3_BUCKET_NAME}/"):
                    try:
                        s3_key = source_uri.split(f"s3://{S3_BUCKET_NAME}/", 1)[1]
                        final_url = s3_client.generate_presigned_url(
                            'get_object',
                            Params={'Bucket': S3_BUCKET_NAME, 'Key': s3_key},
                            ExpiresIn=3600 # Expires in 1 hour
                        )
                        logger.debug(f"Generated presigned URL for s3://{S3_BUCKET_NAME}/{s3_key}")
                    except Exception as e:
                        logger.error(f"Failed to generate presigned URL for {source_uri}: {e}", exc_info=True)
                        # Fallback to basic HTTPS URL if pre-signing fails
                        final_url = re.sub(r'^s3://([^/]+)/(.*)', r'https://\1.s3.amazonaws.com/\2', source_uri)
                elif source_uri.startswith('s3://'): # If S3 URI but doesn't match bucket or client missing
                     if not s3_available:
                         logger.debug(f"Cannot generate presigned URL for {source_uri} - S3 client/bucket name missing. Using standard HTTPS URL.")
                     else: # URI prefix didn't match
                         logger.debug(f"Source URI {source_uri} does not match configured bucket {S3_BUCKET_NAME}. Using standard HTTPS URL.")
                     final_url = re.sub(r'^s3://([^/]+)/(.*)', r'https://\1.s3.amazonaws.com/\2', source_uri)
                # --- End Pre-signed URL Generation ---

                current_source_info = {
                    "url": final_url, # Use the generated (or fallback) URL
                    "score": current_score,
                    "_s3_uri_internal": source_uri # Keep original for internal use if needed
                }
                if page_number is not None:
                    current_source_info["page"] = page_number

                logger.debug(f"Updating best source for {source_uri} (Score: {current_score}, Page: {page_number}, Preview: '{text_chunk_preview}...')")
                best_sources_by_uri[source_uri] = current_source_info
            else:
                logger.debug(f"Ignoring chunk for {source_uri} (Score: {current_score}) - Existing best score is {existing_best_score:.4f}")
        else:
            logger.debug(f"Ignoring result chunk without S3 URI. Chunk Preview: '{text_chunk_preview}...'")

    # Prepare final list
    deduplicated_sources = list(best_sources_by_uri.values())
    deduplicated_sources.sort(key=lambda x: x.get('score', 0.0), reverse=True)
    for source in deduplicated_sources: source.pop('_s3_uri_internal', None) # Clean up internal field

    logger.info(f"Finished extracting sources from single KB result. Count: {len(deduplicated_sources)} (from {num_chunks} chunks).")
    logger.debug(f"Processed Sources List for response: {deduplicated_sources}")
    return deduplicated_sources
# --- End MODIFIED extract_sources function ---


def is_relevant(sources, threshold=0.4):
    """Check if the top source score is above a given threshold."""
    if not sources:
        return False
    # Assumes sources are sorted by score descending
    top_score = sources[0].get('score', 0.0)
    relevant = top_score > threshold
    logger.info(f"Relevance check: Top score = {top_score:.4f}, Threshold = {threshold}, Relevant = {relevant}")
    return relevant

def transform_history(history, limit=25):
    """Transforms chat history into the Bedrock Converse API format."""
    transformed = []
    last_role = None
    # Ensure history is a list, default to empty list if not
    if not isinstance(history, list):
        logger.warning(f"History input was not a list, treating as empty. Input type: {type(history)}")
        history = []

    logger.info(f"Transforming raw history (limit {limit} entries). Total entries: {len(history)}")
    logger.debug(f"Raw history (last {limit}): {history[-limit:]}")

    for entry in history[-limit:]:
        # Basic validation of entry structure
        if not isinstance(entry, dict):
            logger.warning(f"Skipping non-dictionary history entry: {entry}")
            continue

        message_type = entry.get('type')
        message_content = entry.get('message', '').strip()
        sent_by = entry.get('sentBy')

        # Skip if essential fields are missing or if it's an empty text message
        if not message_type or not sent_by or (message_type == 'TEXT' and not message_content):
            logger.debug(f"Skipping invalid/empty history entry: {entry}")
            continue
        # Only include TEXT messages in Bedrock history
        if message_type != 'TEXT':
            logger.debug(f"Skipping non-TEXT history entry (type: {message_type}): {entry}")
            continue

        role = 'user' if sent_by == 'USER' else 'assistant'

        # Bedrock Converse API requires alternating user/assistant roles.
        if role == last_role:
            # Option 1: Merge consecutive messages (if the same role)
            # Be cautious with merging, as it can create very long messages.
            # Let's try merging for now, but add length checks if it becomes an issue.
            if transformed:
                logger.debug(f"Merging consecutive message with role '{role}'.")
                transformed[-1]['content'][0]['text'] += f"\n{message_content}"
                continue # Skip adding a new entry, just updated the last one
            else:
                # If the very first message would be a duplicate role (shouldn't happen with checks below)
                logger.warning(f"Skipping consecutive history message with role '{role}' at the beginning.")
                continue

        # Add the message to the transformed list
        transformed.append({ "role": role, "content": [{"text": message_content}] })
        last_role = role
        logger.debug(f"Added history message: Role={role}, Content='{message_content[:50]}...'")

    # Final check: Bedrock API requires the conversation messages to start with a 'user' message.
    if transformed and transformed[0]['role'] == 'assistant':
        logger.warning("History transformation started with 'assistant', removing the first entry to ensure 'user' starts.")
        transformed.pop(0)

    # Bedrock API expects the *last* message provided in the `messages` history
    # (before the new user prompt is added) to ideally be from the 'assistant'.
    # If the transformed history ends with 'user', the API call might still work,
    # but it's less standard. We don't explicitly remove the last 'user' message here,
    # as the current user prompt will be added after this history.

    logger.info(f"Result of transform_history (count: {len(transformed)}).")
    logger.debug(f"Transformed history: {transformed}")
    return transformed


def extract_keyword(text):
    """Simple keyword extraction (improved)."""
    if not text: return None
    text_lower = text.lower()
    # 1. Quoted text (non-greedy) - Prefer double quotes first, then single
    quoted_match = re.search(r'"([^"]+)"', text) # Double quotes
    if not quoted_match:
        quoted_match = re.search(r"'([^']+)'", text) # Single quotes

    if quoted_match:
        keyword = quoted_match.group(1).strip()
        # Basic validation: not empty, not excessively long
        if keyword and len(keyword) < 50:
            logger.info(f"Extracted quoted keyword: '{keyword}'")
            return keyword

    # 2. After trigger phrases (more specific triggers)
    # Prioritize phrases that strongly imply a single keyword follows
    triggers = [
         # Keep specific ones first
        "count documents mentioning ", "papers mentioning ", "documents containing ", "papers containing ",
        "count documents about ", "count documents for ", "keyword ", "term ",
        # *** ADDED/MODIFIED TRIGGER HERE ***
        "mention ", # <-- Add this trigger back (or similar)
        # --- End Addition ---
        "count ", # More generic, lower priority
        "find ", "list ", "search for " # Also lower priority
        ]
    best_candidate = None
    # Iterate through triggers to find the *first* match and extract the text after it
    for trigger in triggers:
        # Ensure the trigger is found *with a space after it* or at the end,
        # unless it's already space-terminated in the list.
        # Let's refine the check slightly:
        trigger_pattern = trigger # Use the trigger as listed
        if not trigger.endswith(" "): trigger_pattern += r"\s+" # Add required space if not ending with one

        # Use regex search for better word boundary handling if needed, but simple find might be okay
        try:
            start_index = text_lower.find(trigger)
            if start_index != -1:
                # Calculate start of the actual keyword (after the trigger)
                keyword_start_index = start_index + len(trigger)
                following_text = text[keyword_start_index:].strip() # Use original case text now

                # --- (Rest of the extraction logic: splitting words, stripping punctuation) ---
                words_after = following_text.split()
                if words_after:
                    # Heuristic: Take up to 3 words, unless the first is very short
                    num_words = 1
                    if len(words_after) > 1 and len(words_after[0]) < 4: num_words = 2
                    if len(words_after) > 2 and len(words_after[0]) + len(words_after[1]) < 7: num_words = 3

                    candidate = " ".join(words_after[:num_words]).strip('?.!,;"\'') # Strip punctuation

                    # Basic validity checks
                    if candidate and len(candidate) > 1 and len(candidate) < 50: # Check length
                         # Avoid common instruction words unless they are the *only* word
                         common_words = {"the", "a", "an", "is", "in", "on", "of", "at", "how", "what", "which", "who", "papers", "documents", "files"}
                         # Check against lowercased candidate for common words
                         if len(words_after) == 1 or candidate.lower() not in common_words:
                             logger.info(f"Found keyword candidate after '{trigger}': '{candidate}'")
                             best_candidate = candidate
                             break # Found a candidate, stop searching triggers
        except Exception as e:
             logger.warning(f"Error during trigger processing for '{trigger}': {e}", exc_info=True)
             continue # Move to next trigger

    if best_candidate:
        logger.info(f"Selected best keyword candidate: '{best_candidate}'")
        return best_candidate


    # 3. Fallback: If no other method worked, look for capitalized words (simple noun phrase attempt)
    # This is less reliable and might need refinement
    # potential_nouns = re.findall(r'\b[A-Z][a-z]*\b(?:\s+[A-Z][a-z]*)*', text) # Find sequences of capitalized words
    # if potential_nouns:
    #      # Filter out very short ones or ones at the start of the sentence (like 'How')
    #      valid_nouns = [noun for noun in potential_nouns if len(noun) > 2 and not text.startswith(noun)]
    #      if valid_nouns:
    #           # Heuristic: Pick the first one found after the first few words?
    #           # Or the longest one? Let's try the first reasonable one.
    #           logger.info(f"Using capitalized word fallback. Found: {valid_nouns}. Selecting: {valid_nouns[0]}")
    #           return valid_nouns[0].lower() # Return lowercase

    logger.warning(f"Could not reliably extract keyword using simple methods from: '{text}'")
    return None


# --- Main Lambda Handler ---
def lambda_handler(event, context):
    request_id = context.aws_request_id if context else "N/A"
    start_time = time.time()
    # Use json.dumps for potentially complex event structures, handle None context
    event_log = json.dumps(event) if event else "{}"
    logger.info(f"START RequestId: {request_id} Event: {event_log}")

    # Safely get connectionId and body (assuming body might contain the actual message)
    connectionId = None
    event_body = None
    # if 'requestContext' in event:
    #     connectionId = event['requestContext'].get('connectionId')
    #     if event['requestContext'].get('routeKey') == '$connect':
    #         logger.info(f"Handling $connect event for ConnectionId: {connectionId}")
    #         return {'statusCode': 200, 'body': json.dumps('Connected.')}
    #     elif event['requestContext'].get('routeKey') == '$disconnect':
    #         logger.info(f"Handling $disconnect event for ConnectionId: {connectionId}")
    #         # Perform cleanup if needed
    #         return {'statusCode': 200, 'body': json.dumps('Disconnected.')}
    #     elif event['requestContext'].get('routeKey') == '$default':
    #          # This is likely where messages arrive
    #          pass # Continue processing
    #     else: # Handle custom routes if any
    #         logger.warning(f"Received unhandled routeKey: {event['requestContext'].get('routeKey')}")
    #         # Potentially return error or ignore

 # --- NEW CODE: Read connectionId directly from the event payload ---
    connectionId = event.get('connectionId')
    # The event object *is* the body when invoked asynchronously like this
    event_body = event
    # --- END NEW CODE ---
    
    # # Extract payload from the body if present
    # try:
    #     if 'body' in event and event['body']:
    #         event_body = json.loads(event['body'])
    #     else:
    #         event_body = {} # Treat as empty if no body
    # except json.JSONDecodeError:
    #     logger.error(f"Failed to decode JSON body: {event.get('body')}")
    #     # Cannot easily send error back if connectionId is unknown here or message format is wrong
    #     return {'statusCode': 400, 'body': json.dumps({'error': 'Invalid JSON body.'})}

    
    # --- Initialize API Gateway Management Client ---
    # Needs to be initialized *after* potentially extracting connectionId
    gateway_client = None
    if WEBSOCKET_CALLBACK_URL:
        try:
            gateway_client = boto3.client("apigatewaymanagementapi", endpoint_url=WEBSOCKET_CALLBACK_URL)
            logger.info(f"API Gateway Management client initialized for endpoint: {WEBSOCKET_CALLBACK_URL}")
        except Exception as e:
            logger.error(f"CRITICAL: Failed GW Client Init: {e}", exc_info=True)
            # Cannot send WS error if client init fails
            return {'statusCode': 500, 'body': json.dumps({'error': 'Internal server error (GW Client).'})}
    else:
        logger.error("CRITICAL: Callback URL missing. WebSocket communication disabled.")
        # Cannot send WS error if URL is missing
        return {'statusCode': 500, 'body': json.dumps({'error': 'Server config error (Callback URL).'})}


    # --- Extract Data from Body (POST-GW Client Init) ---
    prompt = event_body.get("prompt", "").strip() if event_body else ""
    history_raw = event_body.get("history", []) if event_body else []
    selected_role_key = event_body.get("role", "researchAssistant") if event_body else "researchAssistant"
    persona = BOT_PERSONAS.get(selected_role_key, BOT_PERSONAS["default"])
    system_prompt_text = persona["prompt"]

    # --- Basic Input Validation (POST-GW Client Init) ---
    if not connectionId:
        logger.error("Missing connectionId in requestContext.")
        # Cannot send error back via WS if connectionId is missing
        return {'statusCode': 400, 'body': json.dumps({'error': 'Missing connectionId.'})}
    if not prompt:
        logger.warning("Received empty prompt in message body.")
        send_error_and_end(gateway_client, connectionId, "Please provide a question or prompt.", 400)
        return {'statusCode': 400, 'body': json.dumps({'error': 'Empty prompt received.'})}

    # --- Determine Flow ---
    flow_type = "RAG"; keyword_to_count = None; target_country = None; comparison_entities = None
    prompt_lower = prompt.lower()

    # Flow checks in order of precedence:
    # 1. Explicit Country List Request
    country_query_phrases = ["what countries", "which countries", "country coverage", "countries covered", "countries do you have", "list of countries", "available countries", "supported countries"]
    if any(phrase in prompt_lower for phrase in country_query_phrases):
        flow_type = "COUNTRY_LIST"
    else:
        # 2. Single Country Detection (for filtering RAG)
        target_country = extract_single_country(prompt_lower, SUPPORTED_COUNTRIES)
        if target_country:
            flow_type = "SINGLE_COUNTRY_RAG"
        else:
            # 3. Count/List Query Detection
            count_query_starters = [
                "how many papers", "count papers", "number of papers", "in how many documents",
                "how many documents", "list papers containing", "list documents with",
                "count documents mentioning", "count documents about", "how many files"
                ]
            is_count_query = any(prompt_lower.startswith(phrase) for phrase in count_query_starters) or \
                             ("how many" in prompt_lower and ("appear" in prompt_lower or "contain" in prompt_lower or "mention" in prompt_lower or "exist" in prompt_lower)) or \
                             prompt_lower.startswith("list ") # Simple list trigger

            if is_count_query:
                keyword_to_count = extract_keyword(prompt)
                if keyword_to_count:
                    flow_type = "COUNT"
                else:
                    flow_type = "COUNT_KEYWORD_FAIL"
            else:
                # 4. Comparison Query Detection
                comparison_keywords = ["compare ", "contrast ", "difference between ", "similarities between ", " versus ", " vs ", "between "] # Note spaces
                # Check if keywords appear AND 'and' is present for separating entities
                if any(keyword in prompt_lower for keyword in comparison_keywords) and " and " in prompt_lower:
                     comparison_entities = extract_comparison_entities(prompt_lower)
                     if comparison_entities:
                         flow_type = "COMPARISON"
                     else:
                         # It looked like a comparison, but entity extraction failed
                         flow_type = "COMPARISON_ENTITY_FAIL"
                 # 5. Default RAG (if none of the above match)
                 # flow_type remains "RAG"

    logger.info(f"Determined flow type: {flow_type}. Prompt: '{prompt[:100]}...'")
    # Add details if relevant
    if flow_type == "SINGLE_COUNTRY_RAG": logger.info(f"Target Country: '{target_country}'")
    if flow_type == "COUNT": logger.info(f"Keyword to Count: '{keyword_to_count}'")
    if flow_type == "COMPARISON": logger.info(f"Comparison Entities: {comparison_entities}")

    # --- Execute Selected Flow ---

    # 1. Single Country RAG Flow
    if flow_type == "SINGLE_COUNTRY_RAG":
        logger.info(f"Handling as SINGLE_COUNTRY_RAG for: '{target_country}'")
        # Check prerequisites
        if not KNOWLEDGE_BASE_ID or not agent_runtime_client or not bedrock_runtime_client:
            logger.error("Client/Config missing for SINGLE_COUNTRY_RAG.")
            send_error_and_end(gateway_client, connectionId, "Server configuration error (RAG service).", 500)
            return {'statusCode': 500, 'body': json.dumps({'error': 'Server config error.'})}

        kb_response = None; sources = []; rag_info = ""
        try:
            # IMPORTANT: Assumes filterable metadata key is 'country'. CHANGE IF NEEDED.
            # This key must be configured as filterable in the Bedrock Knowledge Base console.
            metadata_filter_key = "country" # Example key - VERIFY THIS MATCHES YOUR KB SETUP
            filter_dict = {"equals": {"key": metadata_filter_key, "value": target_country}}

            # Call KB retrieval helper with filter
            kb_response = knowledge_base_retrieval(prompt, KNOWLEDGE_BASE_ID, number_of_results=5, filter_dict=filter_dict) # Request 5 results

            if kb_response and kb_response.get('retrievalResults'):
                 # Use the standard extract_sources for the single result set
                sources = extract_sources(kb_response)
                logger.info(f"Sources retrieved after filtering for '{target_country}': {len(sources)} unique sources.")
                logger.debug(f"Filtered Sources: {json.dumps(sources)}")
                is_kb_relevant = is_relevant(sources, threshold=0.4) # Check relevance based on score
                if is_kb_relevant:
                    logger.info("Filtered KB results deemed relevant. Preparing context.")
                    # Combine text from all retrieved (relevant) chunks
                    rag_info = "\n\n".join(res.get("content", {}).get("text", "") for res in kb_response["retrievalResults"] if res.get("content", {}).get("text")).strip()
                    logger.debug(f"Filtered RAG context length: {len(rag_info)} chars")
                else:
                    logger.info("Filtered KB results deemed not relevant based on score threshold.")
                    sources = [] # Clear sources if not relevant enough
            else:
                logger.warning(f"No results found after filtering for country '{target_country}'.")

        except Exception as e:
            logger.error(f"Error during filtered KB retrieval: {e}", exc_info=True)
            rag_info = ""; sources = [] # Ensure these are empty on error

        # --- Continue with RAG Steps (LLM Call) ---
        if not rag_info:
            logger.warning(f"Proceeding to LLM for '{target_country}' without specific RAG context (either no results or not relevant).")

        history = history_raw # Already checked if list earlier
        try:
            transformed_history = transform_history(history)
        except Exception as e:
            logger.error(f"History transform error: {e}", exc_info=True)
            send_error_and_end(gateway_client, connectionId, "Error processing chat history.", 500)
            return {'statusCode': 500, 'body': json.dumps({'error': 'History error.'})}

        llm_prompt_text = prompt # Use original prompt
        if rag_info: # Augment prompt only if relevant context exists
            logger.info(f"Augmenting prompt with filtered RAG context for '{target_country}'.")
            # Persona-specific RAG prefix
            if selected_role_key == "researchAssistant":
                 rag_prefix = f"""Use the following Knowledge Source Information about {target_country.title()} ONLY to answer the user's question:\n<knowledge_source>\n{rag_info}\n</knowledge_source>\n\nUser's question: """
            else: # Default for other personas
                 rag_prefix = f"""Use the following information about {target_country.title()} if relevant to the user's question:\n<knowledge_source>\n{rag_info}\n</knowledge_source>\n\nUser's question: """
            llm_prompt_text = f"{rag_prefix}{prompt}"
        # else: If no rag_info, llm_prompt_text remains the original user prompt

        messages_for_api = transformed_history + [{"role": "user", "content": [{"text": llm_prompt_text}]}]
        system_prompts = [{"text": system_prompt_text}] if system_prompt_text else None

        logger.info(f"Sending SINGLE_COUNTRY_RAG query to LLM '{LLM_MODEL_ID}'. Persona: {persona['name']}. Messages: {len(messages_for_api)}. Context provided: {bool(rag_info)}.")
        logger.debug(f"LLM Request Payload (Single Country RAG): System={system_prompts}, Messages={json.dumps(messages_for_api)}")

        # --- Invoke LLM & Stream Response ---
        try:
            # Call the helper function with retry logic
            response = invoke_llm_with_retry(
                client=bedrock_runtime_client,
                model_id=LLM_MODEL_ID,
                messages=messages_for_api,
                system_prompts=system_prompts
            )

            stream = response.get('stream')
            if stream:
                logger.info("Processing LLM stream for Single Country RAG...")
                stream_finished_normally = False; error_occurred = False; accumulated_text = ""
                for event in stream: # Process stream events...
                    delta_text = None
                    if 'contentBlockDelta' in event:
                        delta = event.get('contentBlockDelta', {}).get('delta', {})
                        delta_text = delta.get('text')
                        if delta_text:
                            accumulated_text += delta_text # Accumulate locally if needed later
                            if not send_ws_message(gateway_client, connectionId, {'statusCode': 200, 'type': 'delta', 'text': delta_text}):
                                logger.warning("Stopping stream processing as WebSocket send failed (delta).")
                                stream_finished_normally = False; error_occurred = True; break # Stop processing stream
                    elif 'messageStop' in event:
                        stop_reason = event['messageStop'].get('stopReason')
                        logger.info(f"LLM Stream stop event received. Reason: {stop_reason}")
                        # Possible reasons: "end_turn", "max_tokens", "stop_sequence", "tool_use", "content_filtered"
                        if stop_reason == "stop_sequence":
                             logger.info("LLM stopped due to stop sequence (likely </knowledge_source>).")
                        elif stop_reason == "content_filtered":
                             logger.warning("LLM generation stopped due to content filtering.")
                             # Send a specific message?
                             send_ws_message(gateway_client, connectionId, {'statusCode': 200, 'type': 'delta', 'text': "\n\n[Note: Response may be incomplete due to content filtering.]"})
                        stream_finished_normally = True # Mark as finished even if filtered etc.
                        break # Exit stream loop
                    elif 'metadata' in event:
                        logger.debug(f"LLM Metadata received: {event['metadata']}") # Contains usage, trace id etc.
                        # Check for content filtering in metadata as well? Some models might put it here.
                        if event['metadata'].get('stop_reason') == 'CONTENT_FILTERED':
                             logger.warning("LLM generation potentially filtered (detected in metadata).")
                             send_ws_message(gateway_client, connectionId, {'statusCode': 200, 'type': 'delta', 'text': "\n\n[Note: Response may be incomplete due to content filtering.]"})

                    # Handle specific stream error events
                    elif 'internalServerException' in event or 'modelStreamErrorException' in event or 'throttlingException' in event or 'validationException' in event:
                         error_detail = event.get('internalServerException') or event.get('modelStreamErrorException') or event.get('throttlingException') or event.get('validationException')
                         logger.error(f"LLM Stream Error Event Received: {error_detail}")
                         error_message = f"LLM stream error: {type(error_detail).__name__}"
                         send_error_and_end(gateway_client, connectionId, error_message, 500)
                         error_occurred = True; stream_finished_normally = False
                         break # Exit stream loop
                    else:
                        logger.warning(f"Unhandled LLM stream event type: {list(event.keys())}")

                # --- After stream processing loop ---
                if not error_occurred:
                    if stream_finished_normally and sources: # Only send sources if stream finished ok AND we have sources
                        logger.info(f"Stream finished normally. Sending {len(sources)} filtered sources.")
                        # Check size before sending sources
                        sources_payload = {'statusCode': 200, 'type': 'sources', 'sources': sources}
                        if len(json.dumps(sources_payload)) < 128 * 1024: # Check against 128KB WS limit
                             if not send_ws_message(gateway_client, connectionId, sources_payload):
                                 logger.warning("Failed to send sources message via WebSocket (post-stream).")
                                 # Don't mark as error, but log it
                        else:
                            logger.warning(f"Sources payload too large ({len(json.dumps(sources_payload))} bytes). Sending truncated message.")
                            send_ws_message(gateway_client, connectionId, {'statusCode': 200, 'type': 'sources', 'sources': [], 'truncated': True, 'message': 'Source list too large to display.'})


                    status_code = 200 if stream_finished_normally else 500 # Use 500 if stream broke mid-way without specific error event
                    end_data = {'statusCode': status_code, 'type': 'end'};
                    if not stream_finished_normally and not error_occurred: # If loop exited early but not via a specific error event
                        end_data['reason'] = 'Stream processing interrupted or incomplete.'
                    if not send_ws_message(gateway_client, connectionId, end_data):
                         logger.warning("Failed to send final 'end' message via WebSocket.")

                    logger.info("Finished processing SINGLE_COUNTRY_RAG LLM stream.")
                    # Log accumulated text length for debugging potential size issues
                    logger.debug(f"Total accumulated delta text length: {len(accumulated_text)} chars")
                    return {'statusCode': status_code, 'body': json.dumps({'message': 'Processed single country RAG request.'})}
                else:
                    # Error message and end signal should have been sent already by send_error_and_end
                    logger.error("Error occurred during stream processing. Final response status 500.")
                    return {'statusCode': 500, 'body': json.dumps({'error': 'LLM stream error occurred.'})}
            else:
                # This case means invoke_llm_with_retry succeeded but didn't return a 'stream' object. Should be rare.
                logger.error("invoke_llm_with_retry returned response without a 'stream' object for Single Country RAG.")
                send_error_and_end(gateway_client, connectionId, "LLM response error (no stream object).", 500)
                return {'statusCode': 500, 'body': json.dumps({'error': 'Bedrock response missing stream object.'})}

        except ClientError as e: # Catch errors from invoke_llm_with_retry (e.g., final Throttling or other ClientError)
            error_type = e.response.get('Error', {}).get('Code', 'UnknownClientError')
            logger.error(f"Bedrock ClientError after retries (Single Country RAG): {error_type} - {e}", exc_info=False) # Log concisely
            send_error_and_end(gateway_client, connectionId, f'LLM API Error ({error_type}). Please try again later.', 500)
            return {'statusCode': 500, 'body': json.dumps({'error': f'LLM API Error: {error_type}'})}
        except Exception as e: # Catch other unexpected errors (e.g., from helpers, during setup before stream)
            logger.error(f"Unexpected error during LLM interaction phase (Single Country RAG): {e}", exc_info=True)
            send_error_and_end(gateway_client, connectionId, 'Error processing your request.', 500)
            return {'statusCode': 500, 'body': json.dumps({'error': f'LLM interaction phase error: {str(e)}'})}


    # 2. Count Query Flow
    elif flow_type == "COUNT":
        logger.info(f"Handling request as COUNT query for keyword: '{keyword_to_count}'")
        tracking_object = { "query_type": "quantitative_count_list_execute", "original_prompt": prompt, "keyword": keyword_to_count, "connection_id": connectionId, "timestamp_utc": datetime.datetime.utcnow().isoformat() }
        logger.info(f"TRACKING: {json.dumps(tracking_object)}")

        # Check prerequisites (OpenSearch client and config)
        # Use specific field names from env vars
        if not opensearch_client or not OPENSEARCH_INDEX or not OPENSEARCH_TEXT_FIELD or not OPENSEARCH_DOC_ID_FIELD or not OPENSEARCH_PAGE_FIELD:
             missing = []
             if not opensearch_client: missing.append("OS Client")
             if not OPENSEARCH_INDEX: missing.append("OS Index")
             if not OPENSEARCH_TEXT_FIELD: missing.append("OS Text Field")
             if not OPENSEARCH_DOC_ID_FIELD: missing.append("OS Doc ID Field")
             if not OPENSEARCH_PAGE_FIELD: missing.append("OS Page Field")
             logger.error(f"OS client/config missing for COUNT. Missing: {', '.join(missing)}")
             send_error_and_end(gateway_client, connectionId, "The document counting service is currently unavailable due to configuration issues.", 503)
             return {'statusCode': 503, 'body': json.dumps({'error': f'OS config/client missing: {", ".join(missing)}'})}

        # --- Perform OpenSearch Aggregation Query for Details ---
        try:
            logger.info(f"Performing OS aggregation for keyword: '{keyword_to_count}'. ...") # Existing log
            # Define the aggregation query body
            query_body = {
    "size": 0,
    "query": {
        "match": {
            OPENSEARCH_TEXT_FIELD: {
                "query": keyword_to_count,
                "operator": "and"
            }
        }
    },
    "aggs": {
        "papers_containing_keyword": {
            "terms": {
                "field": OPENSEARCH_DOC_ID_FIELD, # Group by Doc ID
                "size": 100
                # STILL NO "order" here
            },
            "aggs": { # ADD BACK NESTED AGGS
                # STILL NO "max_chunk_score" sub-agg yet
                "pages": { # ADD BACK "pages" sub-aggregation
                    "terms": {
                        "field": OPENSEARCH_PAGE_FIELD, # e.g., "AMAZON_BEDROCK_METADATA_document-page-number"
                        "size": 50, # Max pages per doc
                        "order": { "_key": "asc" } # Order pages numerically
                    }
                }
            } # End nested aggs
        }
    }
}

            logger.debug(f"OS Aggregation Query Body: {json.dumps(query_body)}") # Existing log

            # Execute the search query against OpenSearch
            response = opensearch_client.search(index=OPENSEARCH_INDEX, body=query_body, request_timeout=60)

            # --- ADD LOGGING FOR THE RAW OPENSEARCH RESPONSE OBJECT ---
            logger.info("--- RAW OpenSearch Aggregation Response Object ---")
            try:
                # Log the entire response object as pretty-printed JSON
                # Use default=str to handle potential non-serializable types like datetime if they somehow appear
                logger.info(json.dumps(response, indent=2, default=str))
            except Exception as log_e:
                logger.error(f"Error formatting raw OpenSearch response for logging: {log_e}")
                # Fallback to logging raw string representation if JSON fails
                logger.info(f"Raw OpenSearch Response (fallback, truncated): {str(response)[:2000]}") # Log first 2000 chars
            # --- END LOGGING ---
            # Define the aggregation query to get details per paper
            query_body = {
                "size": 0, # We only care about aggregation results, not individual hits here
                "query": {
                    "match": { # Using simple match query on the text field
                        OPENSEARCH_TEXT_FIELD: {
                            "query": keyword_to_count,
                            "operator": "and" # Require all terms in the keyword to match (if multi-word)
                        }
                    }
                },
                "aggs": {
                    "papers_containing_keyword": { # Main aggregation name
                        "terms": {
                            "field": OPENSEARCH_DOC_ID_FIELD, # Group by unique source URI (ensure this field is *.keyword if text)
                            "size": 100, # Limit number of unique papers returned in the aggregation
                            "order": { "max_chunk_score": "desc" } # Order papers by relevance score of chunks within them
                        },
                        "aggs": { # Sub-aggregations for each paper bucket
                            "max_chunk_score": {
                                "max": { "field": "_score" } # Get max relevance score among chunks for this paper
                            },
                            "pages": {
                                "terms": {
                                    "field": OPENSEARCH_PAGE_FIELD, # Get unique page numbers (ensure this field is keyword or numeric)
                                    "size": 50, # Max distinct pages to list per paper
                                    "order": { "_key": "asc" } # Order pages numerically (_key refers to the term itself)
                                }
                            }
                            # Could add other aggregations here if needed (e.g., min/max date)
                        }
                    }
                    # We can also get the total count of unique documents directly if needed
                    # "unique_doc_count": {
                    #     "cardinality": {
                    #         "field": OPENSEARCH_DOC_ID_FIELD
                    #     }
                    # }
                }
            } # End query_body

            logger.debug(f"OS Aggregation Query Body: {json.dumps(query_body)}")
            # Increase timeout for potentially complex aggregations
            response = opensearch_client.search(index=OPENSEARCH_INDEX, body=query_body, request_timeout=60)
            logger.debug(f"OS Aggregation Response: {json.dumps(response)}")

            # --- Parse the Aggregation Results ---
            response_lines = []
            unique_doc_count = 0
            aggregations = response.get('aggregations')
            # unique_doc_count_cardinality = aggregations.get('unique_doc_count', {}).get('value') # Get from cardinality if added

            if aggregations and 'papers_containing_keyword' in aggregations:
                buckets = aggregations['papers_containing_keyword'].get('buckets', [])
                unique_doc_count = len(buckets) # Count based on returned buckets
                # Check if the count was capped by the 'size' parameter
                sum_other_doc_count = aggregations['papers_containing_keyword'].get('sum_other_doc_count', 0)

                logger.info(f"Aggregation returned {unique_doc_count} unique document buckets for keyword '{keyword_to_count}'. Sum other doc count: {sum_other_doc_count}.")

                # Add summary line first
                count_qualifier = "exactly" if sum_other_doc_count == 0 else "at least"
                doc_noun = "document" if unique_doc_count == 1 else "documents"
                response_lines.append(f"The keyword '{keyword_to_count}' was found in {count_qualifier} {unique_doc_count} unique {doc_noun} based on the top results:")
                if unique_doc_count > 0:
                    response_lines.append("") # Add a blank line before the list

                # Process each bucket (each unique document)
                s3_available = s3_client and S3_BUCKET_NAME # Check again for pre-signed URLs
                for i, bucket in enumerate(buckets):
                    s3_uri = bucket.get('key') # The unique value of OPENSEARCH_DOC_ID_FIELD
                    doc_count_in_bucket = bucket.get('doc_count') # How many chunks matched in this doc
                    if not s3_uri:
                         logger.warning(f"Skipping bucket {i+1} with missing key (S3 URI).")
                         continue # Skip if key (S3 URI) is missing

                    max_score_info = bucket.get('max_chunk_score', {})
                    max_score = max_score_info.get('value') if max_score_info else None

                    page_buckets = bucket.get('pages', {}).get('buckets', [])
                    pages = []
                    for page_bucket in page_buckets:
                         page_key = page_bucket.get('key')
                         try:
                             # Handle potential float keys if mapping is not strict keyword/integer
                             if isinstance(page_key, (int, float)): pages.append(int(page_key))
                             elif isinstance(page_key, str) and page_key.isdigit(): pages.append(int(page_key))
                             else: logger.warning(f"Could not parse page key: {page_key} (type: {type(page_key)}) for URI {s3_uri}")
                         except (ValueError, TypeError, AttributeError):
                             logger.warning(f"Exception parsing page key: {page_key} for URI {s3_uri}")
                    sorted_pages = sorted(list(set(pages))) # Ensure unique and sorted

                    # Get clean filename for display text
                    clean_filename = get_clean_filename(s3_uri)

                    # --- Generate Pre-signed URL for the link ---
                    link_url = None
                    if s3_available and isinstance(s3_uri, str) and s3_uri.startswith(f"s3://{S3_BUCKET_NAME}/"):
                        try:
                            s3_key = s3_uri.split(f"s3://{S3_BUCKET_NAME}/", 1)[1]
                            link_url = s3_client.generate_presigned_url('get_object', Params={'Bucket': S3_BUCKET_NAME, 'Key': s3_key}, ExpiresIn=3600)
                        except Exception as e:
                            logger.error(f"Presign URL failed for {s3_uri} in COUNT flow: {e}", exc_info=False) # Less verbose logging here
                            # Fallback to HTTPS URL if pre-signing fails
                            link_url = re.sub(r'^s3://([^/]+)/(.*)', r'https://\1.s3.amazonaws.com/\2', s3_uri)
                    elif isinstance(s3_uri, str) and s3_uri.startswith('s3://'): # S3 URI but wrong bucket or no client
                         link_url = re.sub(r'^s3://([^/]+)/(.*)', r'https://\1.s3.amazonaws.com/\2', s3_uri)
                    # else: link_url remains None if it's not a recognizable S3 URI


                    # --- Format the output line with Markdown Link ---
                    score_str = f"(Max Score: {max_score:.2f})" if max_score is not None else ""
                    pages_qualifier = "page" if len(sorted_pages) == 1 else "pages"
                    pages_str = f"on {pages_qualifier}: {', '.join(map(str, sorted_pages))}" if sorted_pages else "on page(s) unknown"
                    chunk_count_str = f"({doc_count_in_bucket} matching chunk{'s' if doc_count_in_bucket != 1 else ''})"


                    if link_url: # Create Markdown link if URL was generated/constructed
                        # Markdown: [Link Text](URL "Optional Title")
                        line_item = f"{i + 1}. [{clean_filename}]({link_url}) {chunk_count_str} {score_str}, {pages_str}"
                    else: # Fallback if URL could not be generated
                        line_item = f"{i + 1}. {clean_filename} {chunk_count_str} {score_str}, {pages_str} (Link unavailable for URI: {s3_uri})"

                    response_lines.append(line_item)
                    # --- End Formatting ---

                if sum_other_doc_count > 0:
                    response_lines.append(f"\n(Note: More documents might contain the keyword but are not listed due to result limits.)")

            # Handle case where aggregation block might be missing or empty
            elif response.get('hits', {}).get('total', {}).get('value', 0) > 0:
                 logger.warning("Keyword found in documents, but aggregation results were empty or missing.")
                 response_lines = [f"Found matches for '{keyword_to_count}', but could not retrieve the document list."]
            else: # No hits and no aggregations
                 logger.info(f"Keyword '{keyword_to_count}' not found in any documents.")
                 response_lines = [f"The keyword '{keyword_to_count}' was not found in any documents in the knowledge base."]

            # Join lines into the final response string
            final_response_text = "\n".join(response_lines)

            # Send response back - Use delta for potentially long lists
            send_ws_message(gateway_client, connectionId, {'statusCode': 200, 'type': 'delta', 'text': final_response_text})
            # Send end signal
            send_ws_message(gateway_client, connectionId, {'statusCode': 200, 'type': 'end'})
            logger.info(f"Successfully handled count/list query for '{keyword_to_count}'. Found {unique_doc_count} docs in top buckets.")
            return {'statusCode': 200, 'body': json.dumps({'message': f'Successfully processed count/list query for {keyword_to_count}.'})}

        # Catch OpenSearch client errors specifically
        except OpenSearchException as os_err:
             logger.error(f"OpenSearch library error during aggregation query for '{keyword_to_count}': {os_err}", exc_info=True)
             # Check for common issues like index not found or auth problems based on error type/message if possible
             error_detail = str(os_err)
             user_message = f"Sorry, there was an error searching the document index for '{keyword_to_count}'. Please try again later."
             if "index_not_found_exception" in error_detail:
                 user_message = "Error: The document index could not be found. Please contact support."
             elif "AuthenticationException" in str(type(os_err)) or "AuthorizationException" in str(type(os_err)):
                  user_message = "Error: Could not authenticate with the document search service. Please contact support."

             send_error_and_end(gateway_client, connectionId, user_message, 500)
             return {'statusCode': 500, 'body': json.dumps({'error': f'OpenSearch query error: {error_detail}'})}
        # Catch general Boto3/AWS errors
        except ClientError as ce:
            logger.error(f"AWS ClientError during OpenSearch interaction for '{keyword_to_count}': {ce}", exc_info=True)
            response_text = f"Sorry, a cloud service error occurred while searching for '{keyword_to_count}'."
            send_error_and_end(gateway_client, connectionId, response_text, 500)
            return {'statusCode': 500, 'body': json.dumps({'error': f'AWS ClientError during OpenSearch query: {str(ce)}'})}
        # Catch other unexpected errors during the process
        except Exception as e:
            logger.error(f"Unexpected error during OpenSearch aggregation query for '{keyword_to_count}': {e}", exc_info=True)
            response_text = f"Sorry, an unexpected error occurred while trying to retrieve document details for '{keyword_to_count}'."
            send_error_and_end(gateway_client, connectionId, response_text, 500)
            return {'statusCode': 500, 'body': json.dumps({'error': f'Unexpected error during OpenSearch aggregation query: {str(e)}'})}


    # 3. Count Keyword Extraction Failure Flow
    elif flow_type == "COUNT_KEYWORD_FAIL":
        logger.warning(f"Handling as COUNT_KEYWORD_FAIL for prompt: '{prompt}'")
        tracking_object = { "query_type": "quantitative_count_list_fail_keyword", "original_prompt": prompt, "connection_id": connectionId, "timestamp_utc": datetime.datetime.utcnow().isoformat() }
        logger.info(f"TRACKING: {json.dumps(tracking_object)}")
        response_text = "Sorry, I couldn't identify the specific keyword or phrase to count or list documents for. Please try again, perhaps putting the keyword in quotes, like 'list documents mentioning \"climate change\"'."
        send_ws_message(gateway_client, connectionId, {'statusCode': 200, 'type': 'delta', 'text': response_text})
        send_ws_message(gateway_client, connectionId, {'statusCode': 200, 'type': 'end'})
        return {'statusCode': 200, 'body': json.dumps({'message': 'Handled count query - keyword extraction failed.'})}

    # 4. Comparison Entity Extraction Failure Flow
    elif flow_type == "COMPARISON_ENTITY_FAIL":
        logger.warning(f"Handling as COMPARISON_ENTITY_FAIL for prompt: '{prompt}'")
        tracking_object = { "query_type": "comparison_fail_entities", "original_prompt": prompt, "connection_id": connectionId, "timestamp_utc": datetime.datetime.utcnow().isoformat() }
        logger.info(f"TRACKING: {json.dumps(tracking_object)}")
        response_text = "Sorry, I couldn't clearly identify the two items you want to compare. Could you please rephrase your request, for example: 'Compare [Item 1] and [Item 2]'?"
        send_error_and_end(gateway_client, connectionId, response_text, 400) # Send as error because input was unclear
        return {'statusCode': 400, 'body': json.dumps({'error': 'Could not extract entities for comparison.'})}

    # 5. Comparison Query Flow <<<< IMPLEMENTED
    elif flow_type == "COMPARISON":
        logger.info(f"Handling request as COMPARISON query between: '{comparison_entities[0]}' and '{comparison_entities[1]}'")
        tracking_object = { "query_type": "comparison_execute", "original_prompt": prompt, "entities": comparison_entities, "connection_id": connectionId, "timestamp_utc": datetime.datetime.utcnow().isoformat() }
        logger.info(f"COMPARISON_TRACKING: {json.dumps(tracking_object)}")

        # Check prerequisites
        if not KNOWLEDGE_BASE_ID or not agent_runtime_client or not bedrock_runtime_client:
            logger.error("Client/Config missing for COMPARISON RAG.")
            send_error_and_end(gateway_client, connectionId, "Server configuration error (Comparison RAG service).", 500)
            return {'statusCode': 500, 'body': json.dumps({'error': 'Server config error for comparison.'})}

        # --- Retrieve KB results for BOTH entities ---
        kb_response_1 = None; kb_response_2 = None
        entity1 = comparison_entities[0]
        entity2 = comparison_entities[1]
        num_results_per_entity = 3 # How many results to fetch per entity (adjust as needed)

        try:
            logger.info(f"Retrieving KB info for entity 1: '{entity1}'")
            kb_response_1 = knowledge_base_retrieval(entity1, KNOWLEDGE_BASE_ID, number_of_results=num_results_per_entity)
        except Exception as e:
            logger.error(f"Error retrieving KB for entity 1 ('{entity1}'): {e}", exc_info=True)
            # Continue, maybe we get results for the second entity

        try:
            logger.info(f"Retrieving KB info for entity 2: '{entity2}'")
            kb_response_2 = knowledge_base_retrieval(entity2, KNOWLEDGE_BASE_ID, number_of_results=num_results_per_entity)
        except Exception as e:
            logger.error(f"Error retrieving KB for entity 2 ('{entity2}'): {e}", exc_info=True)
            # Continue

        # --- Combine Context and Sources ---
        rag_info = ""
        sources = []
        all_results = []
        if kb_response_1 and kb_response_1.get('retrievalResults'):
            all_results.append(kb_response_1)
            logger.info(f"Got {len(kb_response_1['retrievalResults'])} chunks for entity 1.")
        else: logger.info(f"No results or error for entity 1: '{entity1}'")

        if kb_response_2 and kb_response_2.get('retrievalResults'):
            all_results.append(kb_response_2)
            logger.info(f"Got {len(kb_response_2['retrievalResults'])} chunks for entity 2.")
        else: logger.info(f"No results or error for entity 2: '{entity2}'")

        if not all_results:
             logger.warning(f"No KB results found for either comparison entity: '{entity1}', '{entity2}'. Proceeding without RAG context.")
             rag_info = ""
             sources = []
        else:
            # Combine text from all retrieved chunks across both entities
            combined_texts = []
            for res_set in all_results:
                for res in res_set['retrievalResults']:
                     text = res.get("content", {}).get("text")
                     if text: combined_texts.append(text)
            rag_info = "\n\n".join(combined_texts).strip()
            logger.info(f"Combined RAG context length for comparison: {len(rag_info)} chars.")

            # Combine and de-duplicate sources using the helper
            try:
                sources = prepare_combined_sources(all_results, s3_client, S3_BUCKET_NAME)
                logger.info(f"Prepared {len(sources)} combined and de-duplicated sources for comparison.")
            except Exception as e:
                logger.error(f"Error preparing combined sources for comparison: {e}", exc_info=True)
                sources = [] # Ensure sources is empty list on error

        # --- Prepare for LLM Call ---
        history = history_raw
        try:
            transformed_history = transform_history(history)
        except Exception as e:
            logger.error(f"History transform error (Comparison): {e}", exc_info=True)
            send_error_and_end(gateway_client, connectionId, "Error processing chat history.", 500)
            return {'statusCode': 500, 'body': json.dumps({'error': 'History error.'})}

        entity1_name = entity1.title()
        entity2_name = entity2.title()
        llm_prompt_text = ""

        if rag_info:
            logger.info(f"Augmenting prompt with combined RAG context for comparison.")
            # Construct a clear comparison instruction using the combined context
            # Use the persona-specific instruction style
            if selected_role_key == "researchAssistant":
                 comparison_prefix = f"""Use the following Knowledge Source Information ONLY to compare and contrast '{entity1_name}' and '{entity2_name}'. Analyze similarities and differences based strictly on the provided text. Do not use prior knowledge. \n<knowledge_source>\n{rag_info}\n</knowledge_source>\n\nBased on this information, address the user's comparison request: """
            else: # Default/other personas
                 comparison_prefix = f"""Use the following information to help compare '{entity1_name}' and '{entity2_name}':\n<knowledge_source>\n{rag_info}\n</knowledge_source>\n\nNow, please compare and contrast them, addressing the user's request: """
            llm_prompt_text = f"{comparison_prefix}{prompt}" # Append original prompt for full context
        else:
             # If no RAG info, frame the request without the context constraint but still guide the comparison
             logger.warning("Proceeding with comparison without RAG context.")
             llm_prompt_text = f"Please compare and contrast '{entity1_name}' and '{entity2_name}'. User's original request was: {prompt}"


        messages_for_api = transformed_history + [{"role": "user", "content": [{"text": llm_prompt_text}]}]
        system_prompts = [{"text": system_prompt_text}] if system_prompt_text else None

        logger.info(f"Sending COMPARISON query to LLM '{LLM_MODEL_ID}'. Persona: {persona['name']}. Messages: {len(messages_for_api)}. Context provided: {bool(rag_info)}.")
        logger.debug(f"LLM Request Payload (Comparison): System={system_prompts}, Messages={json.dumps(messages_for_api)}")

        # --- Invoke LLM & Stream Response (Similar to other RAG flows) ---
        try:
            # Call the helper function with retry logic
            response = invoke_llm_with_retry(
                client=bedrock_runtime_client,
                model_id=LLM_MODEL_ID,
                messages=messages_for_api,
                system_prompts=system_prompts
            )

            stream = response.get('stream')
            if stream:
                logger.info("Processing LLM stream for Comparison...")
                stream_finished_normally = False; error_occurred = False; accumulated_text = ""
                for event in stream: # Process stream events...
                    delta_text = None
                    if 'contentBlockDelta' in event:
                        delta = event.get('contentBlockDelta', {}).get('delta', {})
                        delta_text = delta.get('text')
                        if delta_text:
                            accumulated_text += delta_text
                            if not send_ws_message(gateway_client, connectionId, {'statusCode': 200, 'type': 'delta', 'text': delta_text}):
                                logger.warning("Stopping comparison stream processing as WebSocket send failed (delta).")
                                stream_finished_normally = False; error_occurred = True; break
                    elif 'messageStop' in event:
                        stop_reason = event['messageStop'].get('stopReason')
                        logger.info(f"LLM Stream stop event received (Comparison). Reason: {stop_reason}")
                        if stop_reason == "stop_sequence": logger.info("LLM stopped due to stop sequence.")
                        elif stop_reason == "content_filtered": logger.warning("LLM generation stopped (Comparison) due to content filtering.")
                        stream_finished_normally = True
                        break
                    elif 'metadata' in event: logger.debug(f"LLM Metadata received (Comparison): {event['metadata']}")
                    elif 'internalServerException' in event or 'modelStreamErrorException' in event or 'throttlingException' in event or 'validationException' in event:
                        error_detail = event.get('internalServerException') or event.get('modelStreamErrorException') or event.get('throttlingException') or event.get('validationException')
                        logger.error(f"LLM Stream Error Event Received (Comparison): {error_detail}")
                        send_error_and_end(gateway_client, connectionId, f"LLM stream error: {type(error_detail).__name__}", 500)
                        error_occurred = True; stream_finished_normally = False; break
                    else: logger.warning(f"Unhandled LLM stream event type (Comparison): {list(event.keys())}")

                # --- After stream processing loop ---
                if not error_occurred:
                    if stream_finished_normally and sources: # Send combined sources if stream OK
                        logger.info(f"Comparison stream finished normally. Sending {len(sources)} combined sources.")
                        sources_payload = {'statusCode': 200, 'type': 'sources', 'sources': sources}
                        if len(json.dumps(sources_payload)) < 128 * 1024:
                             if not send_ws_message(gateway_client, connectionId, sources_payload):
                                 logger.warning("Failed to send combined sources message via WebSocket (post-stream).")
                        else:
                            logger.warning(f"Combined sources payload too large ({len(json.dumps(sources_payload))} bytes). Sending truncated message.")
                            send_ws_message(gateway_client, connectionId, {'statusCode': 200, 'type': 'sources', 'sources': [], 'truncated': True, 'message': 'Combined source list too large to display.'})


                    status_code = 200 if stream_finished_normally else 500
                    end_data = {'statusCode': status_code, 'type': 'end'}
                    if not stream_finished_normally and not error_occurred:
                        end_data['reason'] = 'Comparison stream processing interrupted or incomplete.'
                    if not send_ws_message(gateway_client, connectionId, end_data):
                         logger.warning("Failed to send final 'end' message via WebSocket (Comparison).")

                    logger.info("Finished processing COMPARISON LLM stream.")
                    logger.debug(f"Total accumulated delta text length (Comparison): {len(accumulated_text)} chars")
                    return {'statusCode': status_code, 'body': json.dumps({'message': 'Processed comparison request.'})}
                else:
                    logger.error("Error occurred during comparison stream processing. Final response status 500.")
                    return {'statusCode': 500, 'body': json.dumps({'error': 'LLM stream error occurred during comparison.'})}
            else:
                logger.error("invoke_llm_with_retry returned response without 'stream' object for Comparison.")
                send_error_and_end(gateway_client, connectionId, "LLM response error (no stream object).", 500)
                return {'statusCode': 500, 'body': json.dumps({'error': 'Bedrock response missing stream object for comparison.'})}

        except ClientError as e:
            error_type = e.response.get('Error', {}).get('Code', 'UnknownClientError')
            logger.error(f"Bedrock ClientError after retries (Comparison): {error_type} - {e}", exc_info=False)
            send_error_and_end(gateway_client, connectionId, f'LLM API Error ({error_type}) during comparison. Please try again.', 500)
            return {'statusCode': 500, 'body': json.dumps({'error': f'LLM API Error (Comparison): {error_type}'})}
        except Exception as e:
            logger.error(f"Unexpected error during LLM interaction phase (Comparison): {e}", exc_info=True)
            send_error_and_end(gateway_client, connectionId, 'Error processing your comparison request.', 500)
            return {'statusCode': 500, 'body': json.dumps({'error': f'LLM interaction phase error (Comparison): {str(e)}'})}


    # 6. Country List Flow
    elif flow_type == "COUNTRY_LIST":
        logger.info(f"Handling as COUNTRY_LIST for prompt: '{prompt}'")
        tracking_object = { "query_type": "country_list_request", "original_prompt": prompt, "connection_id": connectionId, "timestamp_utc": datetime.datetime.utcnow().isoformat() }
        logger.info(f"TRACKING: {json.dumps(tracking_object)}")
        try:
            # Sort alphabetically, then format with title case
            sorted_countries = sorted(list(SUPPORTED_COUNTRIES))
            formatted_countries = ", ".join(c.title() for c in sorted_countries)
            response_text = f"Based on the current configuration, I have access to information related to the following countries: {formatted_countries}."
            # Send as delta and end
            send_ws_message(gateway_client, connectionId, {'statusCode': 200, 'type': 'delta', 'text': response_text})
            send_ws_message(gateway_client, connectionId, {'statusCode': 200, 'type': 'end'})
            logger.info("Successfully handled country list request.")
            return {'statusCode': 200, 'body': json.dumps({'message': 'Handled country list request.'})}
        except Exception as e:
            logger.error(f"Error handling country list: {e}", exc_info=True)
            send_error_and_end(gateway_client, connectionId, "Sorry, I encountered an error while trying to list the supported countries.", 500)
            return {'statusCode': 500, 'body': json.dumps({'error': 'Error handling country list.'})}


    # 7. Default RAG Flow (No specific country, count, comparison, or list detected)
    else: # flow_type == "RAG"
        logger.info(f"Handling request as standard RAG flow for prompt: '{prompt[:100]}...'")
        tracking_object = { "query_type": flow_type, "original_prompt": prompt, "connection_id": connectionId, "timestamp_utc": datetime.datetime.utcnow().isoformat() } # Use "RAG" as type
        logger.info(f"TRACKING: {json.dumps(tracking_object)}")

        # Check prerequisites
        if not KNOWLEDGE_BASE_ID or not agent_runtime_client or not bedrock_runtime_client:
            logger.error("Client/Config missing for standard RAG.")
            send_error_and_end(gateway_client, connectionId, "Server configuration error (RAG service).", 500)
            return {'statusCode': 500, 'body': json.dumps({'error': 'Server config error.'})}

        # --- Standard KB Retrieval (NO FILTER) ---
        kb_response = None; sources = []; rag_info = ""; is_kb_relevant = False
        if prompt: # Should always have prompt here due to earlier check, but be safe
            try:
                # Retrieve slightly more results for standard RAG? e.g., 7
                kb_response = knowledge_base_retrieval(prompt, KNOWLEDGE_BASE_ID, number_of_results=7) # NO FILTER HERE
                if kb_response and kb_response.get('retrievalResults'):
                    sources = extract_sources(kb_response) # Use standard helper
                    logger.info(f"Sources retrieved for standard RAG: {len(sources)} unique sources.")
                    is_kb_relevant = is_relevant(sources, threshold=0.4) # Use same threshold
                    if is_kb_relevant:
                        logger.info("Standard KB results deemed relevant.")
                        rag_info = "\n\n".join(res.get("content", {}).get("text", "") for res in kb_response["retrievalResults"] if res.get("content", {}).get("text")).strip()
                        logger.debug(f"Standard RAG context length: {len(rag_info)} chars")
                    else:
                        logger.info("Standard KB results deemed not relevant based on score threshold.")
                        sources = [] # Clear sources if not relevant
                else:
                    logger.warning("Standard KB retrieval returned no results.")
            except Exception as e:
                logger.error(f"Error during standard KB retrieval: {e}", exc_info=True)
                rag_info = ""; sources = []

        # --- Continue with Standard RAG LLM Call ---
        if not rag_info:
            logger.warning(f"Proceeding to LLM for standard RAG without specific KB context.")

        history = history_raw
        try:
            transformed_history = transform_history(history)
        except Exception as e:
            logger.error(f"History transform error (Standard RAG): {e}", exc_info=True)
            send_error_and_end(gateway_client, connectionId, "Error processing chat history.", 500)
            return {'statusCode': 500, 'body': json.dumps({'error': 'History error.'})}

        llm_prompt_text = prompt # Start with original prompt

        if rag_info: # Augment prompt if relevant context exists
            logger.info(f"Augmenting prompt with standard RAG context.")
            # Persona-specific RAG prefix
            if selected_role_key == "researchAssistant":
                rag_prefix = f"""Use the following Knowledge Source Information ONLY to answer the user's question:\n<knowledge_source>\n{rag_info}\n</knowledge_source>\n\nUser's question: """
            else: # Default for other personas
                rag_prefix = f"""Use the following information if relevant to the user's question:\n<knowledge_source>\n{rag_info}\n</knowledge_source>\n\nUser's question: """
            llm_prompt_text = f"{rag_prefix}{prompt}"
        # else: llm_prompt_text remains the original user prompt

        messages_for_api = transformed_history + [{"role": "user", "content": [{"text": llm_prompt_text}]}]
        system_prompts = [{"text": system_prompt_text}] if system_prompt_text else None

        logger.info(f"Sending standard RAG query to LLM '{LLM_MODEL_ID}'. Persona: {persona['name']}. Messages: {len(messages_for_api)}. Context provided: {bool(rag_info)}.")
        logger.debug(f"LLM Request Payload (Standard RAG): System={system_prompts}, Messages={json.dumps(messages_for_api)}")

        # --- Invoke LLM & Stream Response (Copy logic from Single Country RAG) ---
        try:
            response = invoke_llm_with_retry(
                client=bedrock_runtime_client,
                model_id=LLM_MODEL_ID,
                messages=messages_for_api,
                system_prompts=system_prompts
            )

            stream = response.get('stream')
            if stream:
                logger.info("Processing standard RAG LLM stream...")
                stream_finished_normally = False; error_occurred = False; accumulated_text = ""
                for event in stream: # Process stream events...
                    delta_text = None
                    if 'contentBlockDelta' in event:
                        delta = event.get('contentBlockDelta', {}).get('delta', {})
                        delta_text = delta.get('text')
                        if delta_text:
                             accumulated_text += delta_text
                             if not send_ws_message(gateway_client, connectionId, {'statusCode': 200, 'type': 'delta', 'text': delta_text}):
                                 logger.warning("Stopping standard RAG stream processing as WebSocket send failed (delta).")
                                 stream_finished_normally = False; error_occurred = True; break
                    elif 'messageStop' in event:
                         stop_reason = event['messageStop'].get('stopReason')
                         logger.info(f"LLM Stream stop event received (Standard RAG). Reason: {stop_reason}")
                         if stop_reason == "stop_sequence": logger.info("LLM stopped due to stop sequence.")
                         elif stop_reason == "content_filtered": logger.warning("LLM generation stopped (Standard RAG) due to content filtering.")
                         stream_finished_normally = True
                         break
                    elif 'metadata' in event: logger.debug(f"LLM Metadata received (Standard RAG): {event['metadata']}")
                    elif 'internalServerException' in event or 'modelStreamErrorException' in event or 'throttlingException' in event or 'validationException' in event:
                         error_detail = event.get('internalServerException') or event.get('modelStreamErrorException') or event.get('throttlingException') or event.get('validationException')
                         logger.error(f"LLM Stream Error Event Received (Standard RAG): {error_detail}")
                         send_error_and_end(gateway_client, connectionId, f"LLM stream error: {type(error_detail).__name__}", 500)
                         error_occurred = True; stream_finished_normally = False; break
                    else: logger.warning(f"Unhandled LLM stream event type (Standard RAG): {list(event.keys())}")

                # --- After stream processing loop ---
                if not error_occurred:
                    if stream_finished_normally and sources: # Send sources if relevant and stream OK
                        logger.info(f"Standard RAG stream finished normally. Sending {len(sources)} sources.")
                        sources_payload = {'statusCode': 200, 'type': 'sources', 'sources': sources}
                        if len(json.dumps(sources_payload)) < 128 * 1024:
                             if not send_ws_message(gateway_client, connectionId, sources_payload):
                                 logger.warning("Failed to send standard RAG sources message via WebSocket (post-stream).")
                        else:
                            logger.warning(f"Standard RAG sources payload too large ({len(json.dumps(sources_payload))} bytes). Sending truncated message.")
                            send_ws_message(gateway_client, connectionId, {'statusCode': 200, 'type': 'sources', 'sources': [], 'truncated': True, 'message': 'Source list too large to display.'})

                    status_code = 200 if stream_finished_normally else 500
                    end_data = {'statusCode': status_code, 'type': 'end'};
                    if not stream_finished_normally and not error_occurred:
                        end_data['reason'] = 'Standard RAG stream processing interrupted or incomplete.'
                    if not send_ws_message(gateway_client, connectionId, end_data):
                         logger.warning("Failed to send final 'end' message via WebSocket (Standard RAG).")

                    logger.info("Finished processing standard RAG LLM stream.")
                    logger.debug(f"Total accumulated delta text length (Standard RAG): {len(accumulated_text)} chars")
                    return {'statusCode': status_code, 'body': json.dumps({'message': 'Processed standard RAG request.'})}
                else:
                    logger.error("Error occurred during standard RAG stream processing. Final response status 500.")
                    return {'statusCode': 500, 'body': json.dumps({'error': 'LLM stream error occurred during standard RAG.'})}
            else:
                logger.error("invoke_llm_with_retry returned response without 'stream' object for Standard RAG.")
                send_error_and_end(gateway_client, connectionId, "LLM response error (no stream object).", 500)
                return {'statusCode': 500, 'body': json.dumps({'error': 'Bedrock response missing stream object for standard RAG.'})}

        except ClientError as e:
            error_type = e.response.get('Error', {}).get('Code', 'UnknownClientError')
            logger.error(f"Bedrock ClientError after retries (Standard RAG): {error_type} - {e}", exc_info=False)
            send_error_and_end(gateway_client, connectionId, f'LLM API Error ({error_type}) during standard RAG. Please try again.', 500)
            return {'statusCode': 500, 'body': json.dumps({'error': f'LLM API Error (Standard RAG): {error_type}'})}
        except Exception as e:
            logger.error(f"Unexpected error during LLM interaction phase (Standard RAG): {e}", exc_info=True)
            send_error_and_end(gateway_client, connectionId, 'Error processing your request (standard RAG).', 500)
            return {'statusCode': 500, 'body': json.dumps({'error': f'LLM interaction phase error (Standard RAG): {str(e)}'})}


    # Fallback return - Should ideally not be reached if all flows are handled
    logger.error(f"Request {request_id} reached end of handler unexpectedly. Flow Type was determined as: {flow_type}. This indicates a logic error.")
    # Send error via WS if possible
    if gateway_client and connectionId:
         send_error_and_end(gateway_client, connectionId, "Internal server error (unhandled request flow). Please contact support.", 500)
    # Return Lambda error response
    return {'statusCode': 500, 'body': json.dumps({'error': 'Internal server error - unhandled request flow.'})}