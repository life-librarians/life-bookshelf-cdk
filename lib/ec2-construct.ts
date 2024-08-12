import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from "aws-cdk-lib/aws-iam";
import { VpcConstruct } from "./vpc-construct";

export interface ICdkEc2Props {
  vpcConstruct: VpcConstruct;
  machineImage: ec2.IMachineImage;
  instanceType: ec2.InstanceType;
  instanceIAMRoleArn: string;
  instancePort: number;
  applicationLoadBalancer: elbv2.ApplicationLoadBalancer;
  httpsListener: elbv2.ApplicationListener;
}

export class Ec2Construct extends Construct {
  readonly applicationLoadBalancer: elbv2.ApplicationLoadBalancer;
  readonly vpcConstruct: VpcConstruct;
  readonly targetGroup: elbv2.ApplicationTargetGroup;

  constructor(scope: Construct, id: string, props: ICdkEc2Props) {
    super(scope, id);

    this.vpcConstruct = props.vpcConstruct;

    this.applicationLoadBalancer = props.applicationLoadBalancer;

    // Create a listener for HTTP
    const httpListener = this.applicationLoadBalancer.addListener(
      `${id}-ALBListenerHttp`,
      {
        protocol: elbv2.ApplicationProtocol.HTTP,
        port: 80,
      }
    );
    // 리디렉션 대상 HTTPS://#{host}:443/#{path}?#{query} 상태 코드: HTTP_301
    const httpListenerRule = new elbv2.ApplicationListenerRule(
      this,
      `${id}-ALBListenerRuleHttp`,
      {
        listener: httpListener,
        priority: 1,
        conditions: [elbv2.ListenerCondition.pathPatterns(["/*"])],
        action: elbv2.ListenerAction.redirect({
          protocol: "HTTPS",
          port: "443",
          permanent: true,
        }),
      }
    );

    // Create a target group
    this.targetGroup = props.httpsListener.addTargets(`${id}-TargetGroup`, {
      port: 443,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      healthCheck: {
        path: "/",
        port: "443",
        healthyHttpCodes: "200",
      },
    });

    // Create an EC2 Instance
    const ec2Instance = new ec2.Instance(this, `${id}-Instance`, {
      vpc: this.vpcConstruct.vpc,
      instanceType: props.instanceType,
      machineImage: props.machineImage,
      allowAllOutbound: true,
      role: iam.Role.fromRoleArn(
        this,
        `${id}-IamRoleEc2Instance`,
        props.instanceIAMRoleArn
      ),
    });
  }
}
