// cdk_backend/lib/cdk_backend-stack-instance-b.ts

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda'; // Make sure this is imported
import * as apigatewayv2 from '@aws-cdk/aws-apigatewayv2-alpha';
import * as apigatewayv2_integrations from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { bedrock } from '@cdklabs/generative-ai-cdk-constructs';
import * as amplify from '@aws-cdk/aws-amplify-alpha';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import { Construct } from 'constructs';

interface CdkBackendStackProps extends cdk.StackProps {
  githubToken: string;
}

export class CdkBackendStackInstanceB extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CdkBackendStackProps) {
    super(scope, id, props);

    // --- Knowledge Base Setup ---
    const kb = new bedrock.KnowledgeBase(this, 'kb-instanceB', {
      embeddingsModel: bedrock.BedrockFoundationModel.TITAN_EMBED_TEXT_V2_1024,
      instruction: 'Knowledge base for Litigation B',
    });

    // --- S3 Bucket Reference ---
    const bucketB = s3.Bucket.fromBucketName(
      this,
      'bucket-instanceB',
      'cdkbackendstack-instanceb-litigationbdocbucket15a6-4leqsqspqrxj'
    );

    // --- Knowledge Base Data Source ---
    const dataSourceB = new bedrock.S3DataSource(this, 'datasource-instanceB', {
       bucket: bucketB,
       knowledgeBase: kb,
       chunkingStrategy: bedrock.ChunkingStrategy.DEFAULT,
     });

    // Define the Connect Handler Lambda (From previous step)
    const connectHandler = new lambda.Function(this, 'connect-handler-instanceB', {
        runtime: lambda.Runtime.PYTHON_3_12,
        handler: 'index.lambda_handler',
        code: lambda.Code.fromAsset('lambda/connect-handler'),
        timeout: cdk.Duration.seconds(10),
    });

    // --- WebSocket API Setup ---
    const webSocketApi = new apigatewayv2.WebSocketApi(this, 'ws-api-instanceB', {
      apiName: 'ws-api-instanceB',
      // Use Lambda integration for $connect (From previous step)
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
      stageName: 'production',
      autoDeploy: true,
    });

    // --- Lambda Functions Setup ---
    // Bedrock Interaction Lambda
    const lambdaXbedrock = new lambda.Function(this, 'lambda-bedrock-instanceB', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset('lambda/lambdaXbedrock'),
      environment: {
        URL: webSocketStage.callbackUrl,
        KNOWLEDGE_BASE_ID: kb.knowledgeBaseId,
      },
      timeout: cdk.Duration.minutes(5),
    });

    // **************************************************************** //
    // *** MODIFICATION: Update Bedrock Lambda permissions          *** //
    // **************************************************************** //
    // Grant Bedrock Lambda permissions
    lambdaXbedrock.addToRolePolicy(new iam.PolicyStatement({
        // Action needed for KB Retrieve operation
        // Action needed for Bedrock ConverseStream operation
        actions: ['bedrock:Retrieve', 'bedrock:InvokeModelWithResponseStream'],
        resources: [
            // Permission for the specific KB used in Retrieve
            kb.knowledgeBaseArn,
            // Permission for the specific foundation model used in ConverseStream
            `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-5-sonnet-20240620-v1:0`,
            // Note: Removed titan-embed model ARN - it's used by the KB service, not invoked by this Lambda directly.
        ],
    }));
    // **************************************************************** //

    lambdaXbedrock.addToRolePolicy(new iam.PolicyStatement({ // Permission to send messages back
        actions: ['execute-api:ManageConnections'],
        resources: [`arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.apiId}/${webSocketStage.stageName}/POST/@connections/*`],
    }));

    // WebSocket Handler Lambda for 'sendMessage'
    const webSocketHandler = new lambda.Function(this, 'websocket-handler-instanceB', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset('lambda/web-socket-handler'),
      environment: {
        RESPONSE_FUNCTION_ARN: lambdaXbedrock.functionArn,
      },
    });

    // Grant WebSocket Handler permission to invoke the Bedrock Lambda
    lambdaXbedrock.grantInvoke(webSocketHandler);


    // --- WebSocket API Route Integration ---
    // 'sendMessage' route
    webSocketApi.addRoute('sendMessage', {
      integration: new apigatewayv2_integrations.WebSocketLambdaIntegration(
        'ws-sendMessage-integration-instanceB',
        webSocketHandler
      ),
    });

    // --- Amplify Frontend App Setup ---
     const githubTokenSecret = secretsmanager.Secret.fromSecretNameV2(
       this,
       'GitHubTokenInstanceBImport',
       'pc-github-token'
     );

    const amplifyApp = new amplify.App(this, 'litigationB-ReactApp', {
      appName: 'litigationB-ReactApp',
      sourceCodeProvider: new amplify.GitHubSourceCodeProvider({
        owner: 'Population-Council',
        repository: 'Drugs-Side-Effect-Classification',
        oauthToken: githubTokenSecret.secretValue,
      }),
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '1.0',
        frontend: {
          phases: {
            preBuild: {
              commands: ['cd frontend', 'npm ci']
            },
            build: {
              commands: ['npm run build']
            }
          },
          artifacts: {
            baseDirectory: 'frontend/build',
            files: ['**/*']
          },
          cache: {
            paths: ['frontend/node_modules/**/*']
          }
        }
      }),
    });

    const mainBranch = amplifyApp.addBranch('main', {
      autoBuild: true,
      stage: 'PRODUCTION',
    });

    // Construct the correct WebSocket connection URL
    const webSocketConnectUrl = `wss://${webSocketApi.apiId}.execute-api.${this.region}.amazonaws.com/${webSocketStage.stageName}/`;

    // Add Environment Variables for the Amplify App
    amplifyApp.addEnvironment('REACT_APP_WEBSOCKET_API', webSocketConnectUrl);
    amplifyApp.addEnvironment('REACT_APP_BUCKET_NAME', bucketB.bucketName);
    amplifyApp.addEnvironment('REACT_APP_KNOWLEDGE_BASE_ID', kb.knowledgeBaseId);

    // --- CDK Outputs ---
    new cdk.CfnOutput(this, 'BucketNameInstanceB', { value: bucketB.bucketName });
    new cdk.CfnOutput(this, 'KnowledgeBaseIdInstanceB', { value: kb.knowledgeBaseId });
    new cdk.CfnOutput(this, 'WebSocketConnectURLInstanceB', {
        value: webSocketConnectUrl,
        description: 'WebSocket URL for frontend connection (wss://)'
    });
    new cdk.CfnOutput(this, 'WebSocketCallbackURLInstanceB', {
        value: webSocketStage.callbackUrl,
        description: 'WebSocket Callback URL for backend Lambda (https://)'
    });
    new cdk.CfnOutput(this, 'AmplifyAppURLInstanceB', {
      value: `https://${mainBranch.branchName}.${amplifyApp.appId}.amplifyapp.com`,
      description: 'Amplify Application URL for litigationB-ReactApp',
    });
  }
}