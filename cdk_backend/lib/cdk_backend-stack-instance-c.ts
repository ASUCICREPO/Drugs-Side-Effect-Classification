// lib/cdk_backend-stack-instance-c.ts
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigatewayv2 from '@aws-cdk/aws-apigatewayv2-alpha';
import * as apigatewayv2_integrations from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { bedrock } from '@cdklabs/generative-ai-cdk-constructs';
import * as amplify from '@aws-cdk/aws-amplify-alpha';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import { Construct } from 'constructs';

// ========================================================================
// === VERIFY AND UPDATE THESE CONSTANTS ===
// ========================================================================

const OPENSEARCH_COLLECTION_ENDPOINT = 'eexshdaxm7aaxhtohwdc.us-east-1.aoss.amazonaws.com';
const OPENSEARCH_COLLECTION_ARN = 'arn:aws:aoss:us-east-1:887585754747:collection/eexshdaxm7aaxhtohwdc';
// const OPENSEARCH_COLLECTION_ENDPOINT = 'zc5xc1cffyvxr7z3tcbl.us-east-1.aoss.amazonaws.com';
const OPENSEARCH_INDEX_NAME = 'bedrock-knowledge-base-default-index';
const OPENSEARCH_TEXT_FIELD = 'AMAZON_BEDROCK_TEXT_CHUNK';
const OPENSEARCH_DOC_ID_FIELD = 'x-amz-bedrock-kb-source-uri.keyword';
const OPENSEARCH_LAYER_ARN = 'arn:aws:lambda:us-east-1:887585754747:layer:OpenSearchPythonLayer:1';
const S3_BUCKET_NAME_CONST = 'cdkbackendstack-instanceb-litigationbdocbucket15a6-4leqsqspqrxj'; // optional

// ---- MODEL CONFIG ----
// (Keep MODEL_ID for reference; it's unused when USE_CRI=true)
const MODEL_ID = 'anthropic.claude-3-5-sonnet-20240620-v1:0';

// Switch to 3.7 Sonnet via cross-Region inference profile
const USE_CRI = true;
const INFERENCE_PROFILE_ID = 'us.anthropic.claude-3-7-sonnet-20250219-v1:0';
const INFERENCE_PROFILE_ARN =
  'arn:aws:bedrock:us-east-1:887585754747:inference-profile/us.anthropic.claude-3-7-sonnet-20250219-v1:0';

// Foundation model ARN helper (used when scoping to a single region)
function foundationModelArn(region: string) {
  return `arn:aws:bedrock:${region}::foundation-model/anthropic.claude-3-7-sonnet-20250219-v1:0`;
}

// --- Helpers for ARNs (used only when USE_CRI=false) ---
function modelArn(region: string, id: string) {
  return `arn:aws:bedrock:${region}::foundation-model/${id}`;
}
function inferenceProfileArn(region: string, profileId: string) {
  // Not used since we reference the exact public ARN above
  return `arn:aws:bedrock:${region}::inference-profile/${profileId}`;
}

// ========================================================================

interface CdkBackendStackProps extends cdk.StackProps {
  githubToken: string;
}

export class CdkBackendStackInstanceC extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CdkBackendStackProps) {
    super(scope, id, props);

    // --- Knowledge Base (for future steps) ---
    const kb = new bedrock.KnowledgeBase(this, 'kb-instanceC', {
      embeddingsModel: bedrock.BedrockFoundationModel.TITAN_EMBED_TEXT_V2_1024,
      instruction: 'Knowledge base for i2i chatbot',
    });

    // --- S3 Bucket (documents) ---
    const bucketC = new s3.Bucket(this, 'bucket-instanceC', {
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: false,
    });

    // --- KB Data Source ---
    new bedrock.S3DataSource(this, 'datasource-instanceC', {
      bucket: bucketC,
      knowledgeBase: kb,
      chunkingStrategy: bedrock.ChunkingStrategy.DEFAULT,
    });

    // --- Connect Handler for WebSocket connect route ---
    const connectHandler = new lambda.Function(this, 'connect-handler-instanceC', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset('lambda/connect-handler'),
      timeout: cdk.Duration.seconds(10),
    });

    // --- WebSocket API ---
    const webSocketApi = new apigatewayv2.WebSocketApi(this, 'ws-api-instanceC', {
      apiName: 'ws-api-instanceC',
      connectRouteOptions: {
        integration: new apigatewayv2_integrations.WebSocketLambdaIntegration(
          'ws-connect-integration-instanceC',
          connectHandler
        ),
      },
      disconnectRouteOptions: { integration: new apigatewayv2_integrations.WebSocketMockIntegration('disconnect') },
      defaultRouteOptions: { integration: new apigatewayv2_integrations.WebSocketMockIntegration('default') },
    });

    const webSocketStage = new apigatewayv2.WebSocketStage(this, 'ws-stage-instanceC', {
      webSocketApi,
      stageName: 'production',
      autoDeploy: true,
    });

    // --- OpenSearch Python Layer (kept for later) ---
    const openSearchLayer = lambda.LayerVersion.fromLayerVersionArn(this, 'OpenSearchLayer', OPENSEARCH_LAYER_ARN);

    // --- Main Processing Lambda (lambdaXbedrock) — TALK ONLY ---
    const lambdaXbedrock = new lambda.Function(this, 'lambda-bedrock-instanceC', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset('lambda/lambdaXbedrock'),
      environment: {
        URL: webSocketStage.callbackUrl,
        KNOWLEDGE_BASE_ID: kb.knowledgeBaseId, // not used yet

        // OpenSearch (not used yet in talk-only path)
        OPENSEARCH_ENDPOINT: OPENSEARCH_COLLECTION_ENDPOINT,
        OPENSEARCH_INDEX: OPENSEARCH_INDEX_NAME,
        OPENSEARCH_TEXT_FIELD: OPENSEARCH_TEXT_FIELD,
        OPENSEARCH_DOC_ID_FIELD: OPENSEARCH_DOC_ID_FIELD,
        OPENSEARCH_PAGE_FIELD: 'x-amz-bedrock-kb-document-page-number',

        // S3
        S3_BUCKET_NAME: bucketC.bucketName,

        // Model selection for index.py:
        // constants.py prefers INFERENCE_PROFILE_ID (3.7) when non-empty
        LLM_MODEL_ID: MODEL_ID, // fallback only
        INFERENCE_PROFILE_ID: USE_CRI ? INFERENCE_PROFILE_ID : '',

        // Optional: quick tone control
        SYSTEM_PROMPT: 'You are a concise, helpful assistant.',
      },
      timeout: cdk.Duration.seconds(60),
      memorySize: 256,
      layers: [openSearchLayer],
    });

    // --- WebSocket handler that invokes the main Lambda ---
    const webSocketHandler = new lambda.Function(this, 'websocket-handler-instanceC', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset('lambda/web-socket-handler'),
      environment: {
        RESPONSE_FUNCTION_ARN: lambdaXbedrock.functionArn,
      },
      timeout: cdk.Duration.seconds(10),
    });

    // Allow WS handler to invoke main
    lambdaXbedrock.grantInvoke(webSocketHandler);

    // Route: sendMessage -> webSocketHandler
    webSocketApi.addRoute('sendMessage', {
      integration: new apigatewayv2_integrations.WebSocketLambdaIntegration(
        'ws-sendMessage-integration-instanceC',
        webSocketHandler
      ),
    });

    // --- IAM for lambdaXbedrock ---

    // 1) KB Retrieve (future; harmless now)
    lambdaXbedrock.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:Retrieve'],
      resources: [kb.knowledgeBaseArn],
    }));

    // 2) Inference permissions
    if (!USE_CRI) {
      // On-demand model (e.g., 3.5 Sonnet)
      lambdaXbedrock.addToRolePolicy(new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        resources: [modelArn(this.region, MODEL_ID)],
      }));
    } else {
      // Cross-Region inference profile (Claude 3.7 Sonnet)
      // Authorize BOTH the inference profile AND the underlying foundation model.
      // IMPORTANT: The profile may route to us-east-1, us-east-2, or us-west-2.
      // Use a region wildcard for the foundation model ARN to cover routing.
      lambdaXbedrock.addToRolePolicy(new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        resources: [
          INFERENCE_PROFILE_ARN,                                        // profile-based auth
          'arn:aws:bedrock:*::foundation-model/anthropic.claude-3-7-sonnet-20250219-v1:0', // routed region
        ],
      }));
    }

    // 3) WebSocket: send back to client
    lambdaXbedrock.addToRolePolicy(new iam.PolicyStatement({
      actions: ['execute-api:ManageConnections'],
      resources: [
        `arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.apiId}/${webSocketStage.stageName}/POST/@connections/*`,
      ],
    }));

    // 4) OpenSearch Serverless (scope down in prod)
    lambdaXbedrock.addToRolePolicy(new iam.PolicyStatement({
      actions: ['aoss:APIAccessAll'],
      resources: [OPENSEARCH_COLLECTION_ARN],
    }));

    // 5) S3 GetObject (for presigned URLs later)
    lambdaXbedrock.addToRolePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [bucketC.arnForObjects('*')],
    }));

    // --- Amplify Frontend App ---
    const githubTokenSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'GitHubTokenInstanceBImport',
      'pc-github-token'
    );

    const amplifyApp = new amplify.App(this, 'i2iC-ReactApp', {
      appName: 'i2iC-ReactApp',
      sourceCodeProvider: new amplify.GitHubSourceCodeProvider({
        owner: 'Population-Council',
        repository: 'Drugs-Side-Effect-Classification',
        oauthToken: githubTokenSecret.secretValue,
      }),
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '1.0',
        frontend: {
          phases: {
            preBuild: { commands: ['cd frontend', 'npm ci'] },
            build: { commands: ['npm run build'] },
          },
          artifacts: {
            baseDirectory: 'frontend/build',
            files: ['**/*'],
          },
          cache: {
            paths: ['frontend/node_modules/**/*'],
          },
        },
      }),
      environmentVariables: {
        REACT_APP_WEBSOCKET_API: `wss://${webSocketApi.apiId}.execute-api.${this.region}.amazonaws.com/${webSocketStage.stageName}/`,
      },
    });

    const mainBranch = amplifyApp.addBranch('main', {
      autoBuild: true,
      stage: 'PRODUCTION',
    });

    // --- Outputs ---
    new cdk.CfnOutput(this, 'KnowledgeBaseIdInstanceBOutput', {
      value: kb.knowledgeBaseId,
      description: 'Bedrock Knowledge Base ID',
    });
    new cdk.CfnOutput(this, 'WebSocketConnectURLInstanceBOutput', {
      value: `wss://${webSocketApi.apiId}.execute-api.${this.region}.amazonaws.com/${webSocketStage.stageName}/`,
      description: 'WebSocket URL for frontend connection (wss://)',
    });
    new cdk.CfnOutput(this, 'WebSocketCallbackURLInstanceBOutput', {
      value: webSocketStage.callbackUrl,
      description: 'WebSocket Callback URL for backend Lambda (https://)',
    });
    new cdk.CfnOutput(this, 'LambdaXBedrockFunctionNameOutput', {
      value: lambdaXbedrock.functionName,
      description: 'Name of the main processing Lambda function',
    });
    new cdk.CfnOutput(this, 'LambdaXBedrockFunctionRoleArnOutput', {
      value: lambdaXbedrock.role?.roleArn || 'Role ARN not available',
      description: 'Execution Role ARN for the main processing Lambda',
    });
    new cdk.CfnOutput(this, 'AmplifyAppURLInstanceBOutput', {
      value: `https://${mainBranch.branchName}.${amplifyApp.appId}.amplifyapp.com`,
      description: 'Amplify App URL for main branch',
    });
    new cdk.CfnOutput(this, 'S3BucketNameOutput', {
      value: bucketC.bucketName,
      description: 'Name of the S3 bucket for documents',
    });
  }
}