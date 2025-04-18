import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigatewayv2 from '@aws-cdk/aws-apigatewayv2-alpha';
import * as apigatewayv2_integrations from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { bedrock } from '@cdklabs/generative-ai-cdk-constructs';
import { Construct } from 'constructs';

export class CdkBackendStackInstanceA extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const kb = new bedrock.KnowledgeBase(this, 'kb-instanceA', {
      embeddingsModel: bedrock.BedrockFoundationModel.TITAN_EMBED_TEXT_V2_1024,
      instruction: 'Knowledge base for Research A',
    });

    const bucketA = new s3.Bucket(this, 'bucket-instanceA', {
      bucketName: 'cdkbackendstack-instancea-researchadocbucket',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      publicReadAccess: true,
      blockPublicAccess: new s3.BlockPublicAccess({ blockPublicAcls: false }),
    });

    bucketA.addToResourcePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [`${bucketA.bucketArn}/*`],
      principals: [new iam.AnyPrincipal()],
    }));

    const dataSourceA = new bedrock.S3DataSource(this, 'datasource-instanceA', {
      bucket: bucketA,
      knowledgeBase: kb,
      chunkingStrategy: bedrock.ChunkingStrategy.DEFAULT,
    });

    const webSocketApi = new apigatewayv2.WebSocketApi(this, 'ws-api-instanceA', {
      apiName: 'ws-api-instanceA',
    });

    const webSocketStage = new apigatewayv2.WebSocketStage(this, 'ws-stage-instanceA', {
      webSocketApi,
      stageName: 'production',
      autoDeploy: true,
    });

    const webSocketApiArn = `arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.apiId}/${webSocketStage.stageName}/POST/@connections/*`;

    const lambdaXbedrock = new lambda.Function(this, 'lambda-bedrock-instanceA', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset('lambda/lambdaXbedrock'),
      environment: {
        URL: webSocketStage.callbackUrl,
        KNOWLEDGE_BASE_ID: kb.knowledgeBaseId,
      },
    });

    lambdaXbedrock.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:*', 'execute-api:ManageConnections'],
      resources: ['*'], // Narrow if possible
    }));

    const webSocketHandler = new lambda.Function(this, 'websocket-handler-instanceA', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset('lambda/web-socket-handler'),
      environment: {
        RESPONSE_FUNCTION_ARN: lambdaXbedrock.functionArn,
      },
    });

    lambdaXbedrock.grantInvoke(webSocketHandler);

    webSocketApi.addRoute('sendMessage', {
      integration: new apigatewayv2_integrations.WebSocketLambdaIntegration(
        'ws-integration-instanceA', webSocketHandler
      ),
    });

    webSocketHandler.addToRolePolicy(new iam.PolicyStatement({
      actions: ['execute-api:ManageConnections'],
      resources: [webSocketApiArn],
    }));

    // Output resources to use in Amplify App (manually configure these in your Amplify environment)
    new cdk.CfnOutput(this, 'BucketNameInstanceA', { value: bucketA.bucketName });
    new cdk.CfnOutput(this, 'KnowledgeBaseIdInstanceA', { value: kb.knowledgeBaseId });
    new cdk.CfnOutput(this, 'WebSocketURLInstanceA', { value: webSocketStage.callbackUrl });
  }
}