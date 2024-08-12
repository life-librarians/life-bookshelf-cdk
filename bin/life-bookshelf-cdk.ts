#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as acm from "aws-cdk-lib/aws-certificatemanager";

import {
  ILifeBookshelfCdkConstructProps,
  LifeBookshelfCdkConstruct,
} from "../lib/life-bookshelf-cdk-construct";
import { VpcConstruct } from "../lib/vpc-construct";
import { Construct } from "constructs";

import * as dotenv from "dotenv";
dotenv.config();

class LifeBookshelfCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Generate VPC Construct
    const vpcConstruct = new VpcConstruct(
      this,
      `${process.env.STACK_NAME}-VpcConstruct`
    );

    // Lookup Hosted Zone
    const route53HostedZone = route53.HostedZone.fromLookup(
      this,
      `${process.env.STACK_NAME}-HostedZone`,
      {
        domainName: process.env.HOST_ZONE_NAME as string,
      }
    );

    // Generate ACM Certificate
    const certificate = new acm.Certificate(
      this,
      `${process.env.STACK_NAME}-Certificate`,
      {
        domainName: `*.${process.env.HOST_ZONE_NAME as string}`,
        validation: acm.CertificateValidation.fromDns(route53HostedZone),
      }
    );

    const applicationLoadBalancer = new elbv2.ApplicationLoadBalancer(
      this,
      `${process.env.STACK_NAME}-ALB`,
      {
        vpc: vpcConstruct.vpc,
        internetFacing: true,
      }
    );

    // Create a listener for HTTPS
    const httpsListener = applicationLoadBalancer.addListener(
      `${process.env.STACK_NAME}-ALBListenerHttps`,
      {
        protocol: elbv2.ApplicationProtocol.HTTPS,
        port: 443,
        certificates: [
          {
            certificateArn: certificate.certificateArn,
          },
        ],
        sslPolicy: elbv2.SslPolicy.TLS12,
      }
    );

    const applicationServerConstruct = new LifeBookshelfCdkConstruct(
      this,
      `${process.env.STACK_NAME}-${process.env.APPLICATION_SERVER}-Construct`,
      {
        vpcConstruct: vpcConstruct,
        domainName: process.env.APPLICATION_SERVER_DOMAIN_NAME as string,
        route53HostedZone: route53HostedZone,
        instanceType: ec2.InstanceType.of(
          ec2.InstanceClass.T2,
          ec2.InstanceSize.MICRO
        ),
        machineImage: ec2.MachineImage.fromSsmParameter(
          process.env.AMAZON_LINUX_2023_AMI as string
        ),
        certificate: certificate,
        instancePort: 80,
        applicationLoadBalancer: applicationLoadBalancer,
        httpsListener: httpsListener,
      } as ILifeBookshelfCdkConstructProps
    );

    const aiServerConstruct = new LifeBookshelfCdkConstruct(
      this,
      `${process.env.STACK_NAME}-${process.env.AI_SERVER}-Construct`,
      {
        vpcConstruct: vpcConstruct,
        domainName: process.env.AI_SERVER_DOMAIN_NAME as string,
        route53HostedZone: route53HostedZone,
        instanceType: ec2.InstanceType.of(
          ec2.InstanceClass.T2,
          ec2.InstanceSize.MICRO
        ),
        machineImage: ec2.MachineImage.fromSsmParameter(
          process.env.AMAZON_LINUX_2023_AMI as string
        ),
        instancePort: 80,
        applicationLoadBalancer: applicationLoadBalancer,
        httpsListener: httpsListener,
      } as ILifeBookshelfCdkConstructProps
    );

    // HTTP 호스트 헤더는 {ServiceName}_SERVER_DOMAIN_NAME -> 대상 그룹으로 전달
    // FIXME: 리스너 규칙을 따로 만들어야 할 수도 있음.
    const httpsListenerRule = new elbv2.ApplicationListenerRule(
      this,
      `${id}-ALBListenerRuleHttps`,
      {
        listener: httpsListener,
        priority: 1,
        conditions: [
          elbv2.ListenerCondition.hostHeaders([
            process.env.APPLICATION_SERVER_DOMAIN_NAME as string,
          ]),
          elbv2.ListenerCondition.hostHeaders([
            process.env.AI_SERVER_DOMAIN_NAME as string,
          ]),
        ],
        action: elbv2.ListenerAction.forward([
          applicationServerConstruct.ec2Construct.targetGroup,
          aiServerConstruct.ec2Construct.targetGroup,
        ]),
      }
    );
  }
}

const app = new cdk.App();

new LifeBookshelfCdkStack(app, "LifeBookshelfCdkStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

app.synth();
