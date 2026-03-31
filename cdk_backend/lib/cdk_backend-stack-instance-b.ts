// lib/cdk_backend-stack-instance-b.ts

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
// --- Constants ---
const OPENSEARCH_COLLECTION_ENDPOINT = 'zc5xc1cffyvxr7z3tcbl.us-east-1.aoss.amazonaws.com'; // <-- EXAMPLE ONLY - REPLACE!
const OPENSEARCH_INDEX_NAME = 'bedrock-knowledge-base-default-index';
const OPENSEARCH_TEXT_FIELD = 'AMAZON_BEDROCK_TEXT_CHUNK';
const OPENSEARCH_DOC_ID_FIELD = 'x-amz-bedrock-kb-source-uri.keyword';
const OPENSEARCH_COLLECTION_ARN = 'arn:aws:aoss:us-east-1:887585754747:collection/zc5xc1cffyvxr7z3tcbl';
const OPENSEARCH_LAYER_ARN = 'arn:aws:lambda:us-east-1:887585754747:layer:OpenSearchPythonLayer:1';
const S3_BUCKET_NAME_CONST = 'cdkbackendstack-instanceb-litigationbdocbucket15a6-4leqsqspqrxj'; // Store the bucket name

// --- End Constants ---

// ========================================================================

interface CdkBackendStackProps extends cdk.StackProps {
  githubToken: string;
}

export class CdkBackendStackInstanceB extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CdkBackendStackProps) {
    super(scope, id, props);

    // --- Knowledge Base Setup ---
    // Assumes CDK manages the KB. If KB exists independently, import using fromKnowledgeBaseId or similar.
    const kb = new bedrock.KnowledgeBase(this, 'kb-instanceB', {
      embeddingsModel: bedrock.BedrockFoundationModel.TITAN_EMBED_TEXT_V2_1024,
      instruction: 'Knowledge base for Litigation B', // Optional
    });

    // --- S3 Bucket Reference ---
    // Ensure this bucket exists and the name is correct/stable in your account/region.
    const bucketB = s3.Bucket.fromBucketName(
      this,
      'bucket-instanceB',
      S3_BUCKET_NAME_CONST
    );

    // --- Knowledge Base Data Source ---
    // This associates the S3 bucket with the Knowledge Base via CDK.
     const dataSourceB = new bedrock.S3DataSource(this, 'datasource-instanceB', {
       bucket: bucketB,
       knowledgeBase: kb,
       chunkingStrategy: bedrock.ChunkingStrategy.DEFAULT, // Or your chosen strategy
       // parsingConfiguration: { ... } // Add if needed
     });

    // --- Connect Handler Lambda (for WebSocket connect route) ---
    const connectHandler = new lambda.Function(this, 'connect-handler-instanceB', {
        runtime: lambda.Runtime.PYTHON_3_12,
        handler: 'index.lambda_handler',
        code: lambda.Code.fromAsset('lambda/connect-handler'), // Ensure this path is correct
        timeout: cdk.Duration.seconds(10),
    });

    // --- WebSocket API Setup ---
    const webSocketApi = new apigatewayv2.WebSocketApi(this, 'ws-api-instanceB', {
      apiName: 'ws-api-instanceB',
      connectRouteOptions: {
          integration: new apigatewayv2_integrations.WebSocketLambdaIntegration(
              'ws-connect-integration-instanceB',
              connectHandler
          )
      },
      disconnectRouteOptions: { integration: new apigatewayv2_integrations.WebSocketMockIntegration('disconnect') },
      defaultRouteOptions: { integration: new apigatewayv2_integrations.WebSocketMockIntegration('default') }
    });

    const webSocketStage = new apigatewayv2.WebSocketStage(this, 'ws-stage-instanceB', {
      webSocketApi,
      stageName: 'production', // Consider using environment-specific names (e.g., 'dev', 'prod')
      autoDeploy: true,
    });

    // --- Retrieve the OpenSearch Python Layer ---
    const openSearchLayer = lambda.LayerVersion.fromLayerVersionArn(this, 'OpenSearchLayer', OPENSEARCH_LAYER_ARN);

    // --- Main Processing Lambda (lambdaXbedrock) ---
    const lambdaXbedrock = new lambda.Function(this, 'lambda-bedrock-instanceB', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset('lambda/lambdaXbedrock'), // Ensure this path points to your main lambda code directory
      environment: {
        URL: webSocketStage.callbackUrl, // Needed for sending messages back via WebSocket
        KNOWLEDGE_BASE_ID: kb.knowledgeBaseId, // ID of the associated KB
        // OpenSearch Configuration
        OPENSEARCH_ENDPOINT: OPENSEARCH_COLLECTION_ENDPOINT,
        OPENSEARCH_INDEX: OPENSEARCH_INDEX_NAME,
        OPENSEARCH_TEXT_FIELD: OPENSEARCH_TEXT_FIELD,
        OPENSEARCH_DOC_ID_FIELD: OPENSEARCH_DOC_ID_FIELD,
        OPENSEARCH_PAGE_FIELD: 'x-amz-bedrock-kb-document-page-number', // <-- Set the CORRECT field name here
        // S3 Configuration for Pre-signed URLs
        S3_BUCKET_NAME: bucketB.bucketName, // Pass the actual bucket name
        
      },
      timeout: cdk.Duration.seconds(60), // Allow time for OS query or LLM call
      memorySize: 256, // Increased slightly for libraries
      layers: [openSearchLayer], // Attach the opensearch-py library
    });

    // --- Grant IAM Permissions to lambdaXbedrock ---
    // 1. Bedrock Retrieve/Invoke Model permissions
    lambdaXbedrock.addToRolePolicy(new iam.PolicyStatement({
        actions: [
            'bedrock:Retrieve', // To query the Knowledge Base
            'bedrock:InvokeModelWithResponseStream' // To call the LLM (Claude)
        ],
        resources: [
            kb.knowledgeBaseArn, // Access to the specific KB
            `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-5-sonnet-20240620-v1:0`, // Access to the specific LLM
        ],
    }));
    // 2. WebSocket Send permissions (API Gateway Management API)
    lambdaXbedrock.addToRolePolicy(new iam.PolicyStatement({
        actions: ['execute-api:ManageConnections'], // To send messages back via WebSocket
        resources: [`arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.apiId}/${webSocketStage.stageName}/POST/@connections/*`],
    }));
    // 3. OpenSearch Serverless Query permissions
    lambdaXbedrock.addToRolePolicy(new iam.PolicyStatement({
         actions: [
            "aoss:APIAccessAll" // Broad permission - SCOPE DOWN (e.g., "aoss:SearchIndex", "aoss:DescribeIndex") for production environments
        ],
        resources: [OPENSEARCH_COLLECTION_ARN], // Permission specific to your AOSS collection
    }));
    // 4. S3 GetObject permission (for pre-signed URLs)
    lambdaXbedrock.addToRolePolicy(new iam.PolicyStatement({
        actions: ["s3:GetObject"], // Permission to read objects for pre-signing
        resources: [bucketB.arnForObjects("*")], // Grant for all objects within the specific bucket
    }));


    // --- WebSocket Handler Lambda (Invokes lambdaXbedrock) ---
    const webSocketHandler = new lambda.Function(this, 'websocket-handler-instanceB', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset('lambda/web-socket-handler'), // Ensure this path is correct
      environment: {
        RESPONSE_FUNCTION_ARN: lambdaXbedrock.functionArn, // Pass ARN of function to invoke
      },
      timeout: cdk.Duration.seconds(10), // Should be quick, just invokes asynchronously
    });

    // Grant the handler function permission to invoke the main processing function
    lambdaXbedrock.grantInvoke(webSocketHandler);


    // --- WebSocket API Route Integration ('sendMessage' route) ---
    webSocketApi.addRoute('sendMessage', { // Route key defined by client sending {"action": "sendMessage", ...}
      integration: new apigatewayv2_integrations.WebSocketLambdaIntegration(
        'ws-sendMessage-integration-instanceB', // Integration name
        webSocketHandler // Target Lambda function for this route
      ),
    });

    // --- Amplify Frontend App Setup ---
    // Ensure the secret 'pc-github-token' exists in Secrets Manager in your region
    const githubTokenSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'GitHubTokenInstanceBImport',
      'pc-github-token' // The exact name of the secret storing your GitHub token
    );

    const amplifyApp = new amplify.App(this, 'litigationB-ReactApp', { // Logical ID in CDK, affects Amplify App name
      appName: 'litigationB-ReactApp', // Optional: Explicit Amplify App name
      sourceCodeProvider: new amplify.GitHubSourceCodeProvider({
        owner: 'Population-Council', // Replace with your GitHub owner
        repository: 'Drugs-Side-Effect-Classification', // Replace with your repository
        oauthToken: githubTokenSecret.secretValue, // Securely reference the token
      }),
      // Define build settings matching your frontend structure/commands
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '1.0',
        frontend: {
          phases: {
            preBuild: {
              commands: ['cd frontend', 'npm ci'] // Assumes frontend is in 'frontend' subdir
            },
            build: {
              commands: ['npm run build'] // Assumes standard React build script
            }
          },
          artifacts: {
            baseDirectory: 'frontend/build', // Standard for Create React App
            files: ['**/*']
          },
          cache: {
            paths: ['frontend/node_modules/**/*'] // Cache node_modules
          }
        }
      }),
       // Environment variables available during the Amplify build process
       environmentVariables: {
           'REACT_APP_WEBSOCKET_API': `wss://${webSocketApi.apiId}.execute-api.${this.region}.amazonaws.com/${webSocketStage.stageName}/`,
           // Add any other REACT_APP_ variables needed by your build process
           // 'REACT_APP_AWS_REGION': this.region,
       },
    });

    // Define the branch to build and deploy
    const mainBranch = amplifyApp.addBranch('main', { // Or your default branch name
      autoBuild: true, // Enable CI/CD on push
      stage: 'PRODUCTION', // Amplify stage (e.g., PRODUCTION, DEVELOPMENT)
    });

    // --- CDK Outputs ---
    // These values are printed after deployment and can be useful
    new cdk.CfnOutput(this, 'KnowledgeBaseIdInstanceBOutput', {
      value: kb.knowledgeBaseId,
      description: 'Bedrock Knowledge Base ID'
    });
    new cdk.CfnOutput(this, 'WebSocketConnectURLInstanceBOutput', {
        value: `wss://${webSocketApi.apiId}.execute-api.${this.region}.amazonaws.com/${webSocketStage.stageName}/`,
        description: 'WebSocket URL for frontend connection (wss://)'
    });
    new cdk.CfnOutput(this, 'WebSocketCallbackURLInstanceBOutput', {
        value: webSocketStage.callbackUrl,
        description: 'WebSocket Callback URL for backend Lambda (https://)'
    });
    new cdk.CfnOutput(this, 'LambdaXBedrockFunctionNameOutput', { // Changed logical ID slightly
        value: lambdaXbedrock.functionName,
        description: 'Name of the main processing Lambda function'
    });
    new cdk.CfnOutput(this, 'LambdaXBedrockFunctionRoleArnOutput', { // Added Role ARN output
        value: lambdaXbedrock.role?.roleArn || 'Role ARN not available', // Output the role ARN used in OS policy
        description: 'Execution Role ARN for the main processing Lambda'
    });
    new cdk.CfnOutput(this, 'AmplifyAppURLInstanceBOutput', {
      value: `https://${mainBranch.branchName}.${amplifyApp.appId}.amplifyapp.com`,
      description: 'Amplify App URL for main branch', // Use static description
    });
    new cdk.CfnOutput(this, 'S3BucketNameOutput', { // Added Bucket Name output
        value: bucketB.bucketName,
        description: 'Name of the S3 bucket for documents'
    });
  }
}