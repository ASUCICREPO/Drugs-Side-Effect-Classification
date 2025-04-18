#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CdkBackendStackInstanceA } from '../lib/cdk_backend-stack-instance-a';
import { CdkBackendStackInstanceB } from '../lib/cdk_backend-stack-instance-b';

// Custom props interface imported explicitly
interface CdkBackendStackProps extends cdk.StackProps {
  githubToken: string;
}

const app = new cdk.App();
const githubToken = app.node.tryGetContext('githubToken');

if (!githubToken) {
  throw new Error('GitHub token must be provided. Use -c githubToken=<your-token>');
}

new CdkBackendStackInstanceA(app, 'CdkBackendStack-InstanceA', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  githubToken, // Now recognized due to custom interface
} as CdkBackendStackProps);

new CdkBackendStackInstanceB(app, 'CdkBackendStack-InstanceB', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  githubToken,
} as CdkBackendStackProps);