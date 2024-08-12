import {
  IpAddresses,
  Peer,
  Port,
  SecurityGroup,
  SubnetType,
  Vpc,
} from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

const MAX_AZS = 2; // TODO: Make this configurable
const IPADDRESS_CIDR = "10.0.0.0/16"; // TODO: Make this configurable
const SSH_PORT = 22; // TODO: Make this configurable

export class VpcConstruct extends Construct {
  public sshSecurityGroup: SecurityGroup;
  public vpc: Vpc;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.vpc = new Vpc(this, "Vpc", {
      maxAzs: MAX_AZS,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "Public",
          subnetType: SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: "Private",
          subnetType: SubnetType.PRIVATE_ISOLATED,
        },
      ],
      ipAddresses: IpAddresses.cidr(IPADDRESS_CIDR),
    });

    // Create a security group for SSH
    this.sshSecurityGroup = new SecurityGroup(this, "SSHSecurityGroup", {
      vpc: this.vpc,
      description: "Security Group for SSH",
      allowAllOutbound: true,
    });

    // Allow SSH inbound traffic
    this.sshSecurityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(SSH_PORT));
    this.sshSecurityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(443));
    this.sshSecurityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(80));
  }
}
