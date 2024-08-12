import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { VpcConstruct } from "./vpc-construct";

import * as alias from "aws-cdk-lib/aws-route53-targets";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as iam from "aws-cdk-lib/aws-iam";
import { Ec2Construct } from "./ec2-construct";

export interface ILifeBookshelfCdkConstructProps extends cdk.StackProps {
  vpcConstruct: VpcConstruct;
  domainName: string;
  route53HostedZone: route53.IHostedZone;
  instanceType: ec2.InstanceType;
  machineImage: ec2.IMachineImage;
  certificate: acm.ICertificate;
  instancePort: number;
  applicationLoadBalancer: elbv2.ApplicationLoadBalancer;
  httpsListener: elbv2.ApplicationListener;
}

export class LifeBookshelfCdkConstruct extends cdk.Stack {
  readonly ec2Construct: Ec2Construct;

  constructor(
    scope: Construct,
    id: string,
    props: ILifeBookshelfCdkConstructProps
  ) {
    super(scope, id, props);

    // Generate IAM Role for EC2 Instance
    const instanceRole = new iam.Role(this, `${id}-InstanceRole`, {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        // Attach SSM Policy
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMManagedInstanceCore"
        ),
        // Attach CodeDeploy Policy
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AmazonEC2RoleforAWSCodeDeploy"
        ),
      ],
    });

    // Generate EC2 Construct
    this.ec2Construct = new Ec2Construct(this, `${id}-Ec2Construct`, {
      vpcConstruct: props.vpcConstruct,
      machineImage: props.machineImage,
      instanceType: props.instanceType,
      instanceIAMRoleArn: instanceRole.roleArn,
      instancePort: props.instancePort,
      applicationLoadBalancer: props.applicationLoadBalancer,
      httpsListener: props.httpsListener,
    });

    // Create Route53 A Record
    new route53.ARecord(this, `${id}-ARecord`, {
      zone: props.route53HostedZone,
      target: route53.RecordTarget.fromAlias(
        new alias.LoadBalancerTarget(this.ec2Construct.applicationLoadBalancer)
      ),
      recordName: props.domainName,
    });
  }
}
