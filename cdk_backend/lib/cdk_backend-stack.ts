//cdk_backend-stack.ts

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigatewayv2 from '@aws-cdk/aws-apigatewayv2-alpha';
import * as apigatewayv2_integrations from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
// import * as s3_notifications from 'aws-cdk-lib/aws-s3-notifications';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { bedrock } from '@cdklabs/generative-ai-cdk-constructs';
import * as amplify from '@aws-cdk/aws-amplify-alpha';
import { Construct } from 'constructs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

interface CdkBackendStackProps extends cdk.StackProps {
  githubToken: string;
}

export class CdkBackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CdkBackendStackProps) {
    super(scope, id, props);

    const kb = new bedrock.KnowledgeBase(this, 'pc-bedrock-knowledgebase', {
      embeddingsModel: bedrock.BedrockFoundationModel.TITAN_EMBED_TEXT_V2_1024,
      instruction: 'Use this knowledge base to answer questions about Research Papers',
    });

    // Create the S3 bucket to house our data
    const pc_bucket = new s3.Bucket(this, 'pc-doc-bucket', {
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      publicReadAccess: true,  // Enable public access for the bucket
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: false,      // Allows public ACLs
        ignorePublicAcls: false,      // Allows ignoring public ACLs
        blockPublicPolicy: false,     // Allows public bucket policies
        restrictPublicBuckets: false, // Allows unrestricted public access
      }),
    });

    pc_bucket.addToResourcePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [`${pc_bucket.bucketArn}/*`],
      principals: [new iam.AnyPrincipal()],
    }));

    const s3_data_source = new bedrock.S3DataSource(this, 'pc-document-datasource', {
      bucket: pc_bucket,
      knowledgeBase: kb,
      dataSourceName: 'pc-document-datasource',
      chunkingStrategy: bedrock.ChunkingStrategy.DEFAULT,
    });

    // WebSocketApi
    const webSocketApi = new apigatewayv2.WebSocketApi(this, 'pc-web-socket-api', {
      apiName: 'pc-web-socket-api',
    });

    const webSocketStage = new apigatewayv2.WebSocketStage(this, 'pc-web-socket-stage', {
      webSocketApi,
      stageName: 'production',
      autoDeploy: true,
    });

    const webSocketApiArn = `arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.apiId}/${webSocketStage.stageName}/POST/@connections/*`;

    // lambdaXbedrock Lambda function
    const lambdaXbedrock = new lambda.Function(this, 'pc-get-response-from-bedrock', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('lambda/lambdaXbedrock'),  // Path to your Lambda function code
      handler: 'index.lambda_handler',
      environment: {
        URL: webSocketStage.callbackUrl,
        KNOWLEDGE_BASE_ID: kb.knowledgeBaseId,
      },
      timeout: cdk.Duration.seconds(300),
      memorySize: 256
    });

    lambdaXbedrock.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'bedrock:InvokeModel',
        'bedrock-agent-runtime:Retrieve',
        'bedrock-runtime:InvokeModel',
        'bedrock-runtime:InvokeModelWithResponseStream',
        'bedrock:Retrieve',
        'bedrock:InvokeModelWithResponseStream',
        'execute-api:ManageConnections',
        'execute-api:Invoke'
      ],
      resources: [
        `arn:aws:bedrock:${this.region}:${this.account}:knowledge-base/${kb.knowledgeBaseId}`,
        
        `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-5-sonnet-20240620-v1:0`,
        `arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-3-5-sonnet-20240620-v2:0`,
        `arn:aws:bedrock:${this.region}:${this.account}:agent-runtime/*`,
        `arn:aws:bedrock:${this.region}:${this.account}:*`,
        `arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-3-5-sonnet-20241022-v2:0`,
        
        webSocketApiArn
      ]
    }));

    // web-socket-handler Lambda function
    const webSocketHandler = new lambda.Function(this, 'pc-web-socket-handler', {
      runtime: lambda.Runtime.PYTHON_3_12,
      code: lambda.Code.fromAsset('lambda/web-socket-handler'),
      handler: 'index.lambda_handler',
      environment: {
        RESPONSE_FUNCTION_ARN: lambdaXbedrock.functionArn
      }
    });

    lambdaXbedrock.grantInvoke(webSocketHandler);

    const webSocketIntegration = new apigatewayv2_integrations.WebSocketLambdaIntegration('pc-web-socket-integration', webSocketHandler);

    webSocketApi.addRoute('sendMessage',
      {
        integration: webSocketIntegration,
        returnResponse: true
      }
    );

    webSocketHandler.addToRolePolicy(new iam.PolicyStatement({
      actions: ['execute-api:ManageConnections'],
      resources: [webSocketApiArn],
    }));

    const githubToken = new secretsmanager.Secret(this, 'GitHubToken', {
      secretName: 'pc-github-token',
      description: 'GitHub Personal Access Token for Amplify',
      secretStringValue: cdk.SecretValue.unsafePlainText(props.githubToken)
    });

    // Create the Amplify App
    const amplifyApp = new amplify.App(this, 'PopulationCouncilReactApp', {
      sourceCodeProvider: new amplify.GitHubSourceCodeProvider({
        owner: 'ASUCICREPO',
        repository: 'Drugs-Side-Effect-Classification',
        oauthToken: githubToken.secretValue
      }),
      buildSpec: cdk.aws_codebuild.BuildSpec.fromObjectToYaml({
        version: '1.0',
        frontend: {
          phases: {
            preBuild: {
              commands: [
                'cd frontend',
                'npm ci'
              ]
            },
            build: {
              commands: [
                'npm run build'
              ]
            }
          },
          artifacts: {
            baseDirectory: 'frontend/build',
            files: [
              '**/*'
            ]
          },
          cache: {
            paths: [
              'frontend/node_modules/**/*'
            ]
          }
        }
      }),
    });

    // Add environment variables
    amplifyApp.addEnvironment('REACT_APP_WEBSOCKET_API', webSocketStage.url);

    // Add a branch
    const mainBranch = amplifyApp.addBranch('main', {
      autoBuild: true,
      stage: 'PRODUCTION'
    });

    // Grant Amplify permission to read the secret
    githubToken.grantRead(amplifyApp);




    // const syncKBLambda = new lambda.Function(this, 'syncKBLambda', {
    //   runtime: lambda.Runtime.PYTHON_3_12,
    //   code: lambda.Code.fromAsset('lambda/syncKB'),  // Path to your Lambda function code
    //   handler: 'index.sync_knowledge_base',  // This points to the sync_knowledge_base function

    //   environment: {
    //     KNOWLEDGE_BASE_ID: kb.knowledgeBaseId,  // Knowledge Base ID passed as environment variable
    //     DATA_SOURCE_ID: s3_data_source.dataSourceId,  // Data Source ID passed as environment variable
    //   },
    //   timeout: cdk.Duration.seconds(300),
    //   memorySize: 256,
    // });

    // syncKBLambda.addToRolePolicy(new iam.PolicyStatement({
    //   actions: [
    //     'bedrock-agent-runtime:StartIngestionJob',  // Required permission for starting ingestion jobs
    //     'bedrock-agent-runtime:Retrieve',
    //     'bedrock:Retrieve',
    //   ],
    //   resources: [
    //     `arn:aws:bedrock:${this.region}:${this.account}:knowledge-base/${kb.knowledgeBaseId}`,
    //     `arn:aws:bedrock:${this.region}:${this.account}:data-source/${s3_data_source.dataSourceId}`,
    //   ],
    // }));


    // pc_bucket.grantRead(syncKBLambda);

    // pc_bucket.addEventNotification(
    //   s3.EventType.OBJECT_CREATED_PUT, 
    //   new s3_notifications.LambdaDestination(syncKBLambda),  // Triggers syncKB Lambda
    //   { suffix: '.pdf' }  // Only trigger on PDF uploads
    // );





    new cdk.CfnOutput(this, 'DocumentBucketName', {
      value: pc_bucket.bucketName,
      description: 'Document S3 Bucket Name',
    });

    new cdk.CfnOutput(this, 'KnowledgeBaseId', {
      value: kb.knowledgeBaseId,
      description: 'Bedrock Knowledge Base ID',
    });

    new cdk.CfnOutput(this, 'S3DataSourceId', {
      value: s3_data_source.dataSourceId,
      description: 'S3 Data Source ID',
    });
    new cdk.CfnOutput(this, 'WebSocketHandlerLambdaName', {
      value: webSocketHandler.functionName,
      description: 'Web Socket Handler Lambda Function Name'
    });

    new cdk.CfnOutput(this, 'lambdaXbedrockLambdaName', {
      value: lambdaXbedrock.functionName,
      description: 'Get Response From Bedrock Lambda Function Name'
    });

    new cdk.CfnOutput(this, 'WebSocketURL', {
      value: webSocketStage.callbackUrl,
      description: 'WebSocket URL'
    });

    new cdk.CfnOutput(this, 'GitHubTokenSecretArn', {
      value: githubToken.secretArn,
      description: 'ARN of the gitHub Token Secret',
    });

    new cdk.CfnOutput(this, 'AmplifyAppURL', {
      value: `https://${mainBranch.branchName}.${amplifyApp.defaultDomain}`,
      description: 'Amplify Application URL'
    });






  }
}
