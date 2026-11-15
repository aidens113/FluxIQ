terraform {
  required_version = ">= 1.9, < 2.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
}
provider "aws" { region = var.region }

resource "aws_vpc" "platform" {
  cidr_block           = "10.42.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = var.name }
}
resource "aws_subnet" "platform" {
  vpc_id            = aws_vpc.platform.id
  cidr_block        = "10.42.1.0/24"
  availability_zone = var.availability_zone
}
resource "aws_internet_gateway" "platform" { vpc_id = aws_vpc.platform.id }
resource "aws_route_table" "platform" {
  vpc_id = aws_vpc.platform.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.platform.id
  }
}
resource "aws_route_table_association" "platform" {
  subnet_id      = aws_subnet.platform.id
  route_table_id = aws_route_table.platform.id
}
resource "aws_security_group" "edge" {
  name_prefix = "${var.name}-"
  description = "Only the Caddy TLS edge and certificate HTTP challenge"
  vpc_id      = aws_vpc.platform.id
}
resource "aws_vpc_security_group_ingress_rule" "edge" {
  for_each          = toset(["80", "443"])
  security_group_id = aws_security_group.edge.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = tonumber(each.value)
  to_port           = tonumber(each.value)
}
resource "aws_vpc_security_group_egress_rule" "outbound" {
  security_group_id = aws_security_group.edge.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}
resource "aws_iam_role" "vm" {
  name_prefix = "${var.name}-"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ec2.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}
resource "aws_iam_role_policy" "configuration" {
  role = aws_iam_role.vm.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat([
      { Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = var.config_secret_arn }
      ], var.config_secret_kms_key_arn == null ? [] : [{
        Effect    = "Allow", Action = ["kms:Decrypt"], Resource = var.config_secret_kms_key_arn
        Condition = { StringEquals = { "kms:ViaService" = "secretsmanager.${var.region}.amazonaws.com" } }
    }])
  })
}
resource "aws_iam_instance_profile" "vm" {
  name_prefix = "${var.name}-"
  role        = aws_iam_role.vm.name
}
resource "aws_ebs_volume" "state" {
  availability_zone = var.availability_zone
  type              = "gp3"
  size              = var.data_size_gb
  encrypted         = true
  tags              = { Name = "${var.name}-state" }
  lifecycle { prevent_destroy = true }
}
module "bootstrap" {
  source = "../bootstrap"
  config = {
    provider       = "aws"
    region         = var.region
    release_url    = var.release.url
    release_sha256 = var.release.sha256
    config_secret  = var.config_secret_arn
    data_volume_id = aws_ebs_volume.state.id
  }
}
resource "aws_instance" "platform" {
  ami                         = var.ubuntu_ami_id
  instance_type               = var.instance_type
  subnet_id                   = aws_subnet.platform.id
  vpc_security_group_ids      = [aws_security_group.edge.id]
  associate_public_ip_address = false
  iam_instance_profile        = aws_iam_instance_profile.vm.name
  # cloud-init accepts gzip; compression keeps this below EC2's 16 KiB user-data limit.
  user_data_base64            = base64gzip(module.bootstrap.cloud_init)
  user_data_replace_on_change = true
  metadata_options {
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
    http_protocol_ipv6          = "disabled"
    instance_metadata_tags      = "disabled"
  }
  root_block_device {
    volume_size           = 24
    volume_type           = "gp3"
    encrypted             = true
    delete_on_termination = true
  }
  tags       = { Name = var.name }
  depends_on = [aws_iam_role_policy.configuration, aws_route_table_association.platform]
}
resource "aws_volume_attachment" "state" {
  device_name                    = "/dev/sdf"
  volume_id                      = aws_ebs_volume.state.id
  instance_id                    = aws_instance.platform.id
  stop_instance_before_detaching = true
}
resource "aws_eip" "edge" {
  domain     = "vpc"
  instance   = aws_instance.platform.id
  depends_on = [aws_internet_gateway.platform]
}

output "public_ip" { value = aws_eip.edge.public_ip }
output "instance_id" { value = aws_instance.platform.id }
output "retained_state_disk" { value = aws_ebs_volume.state.id }
output "runtime_identity" { value = aws_iam_role.vm.arn }
