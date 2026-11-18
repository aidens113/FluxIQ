variable "name" {
  type    = string
  default = "fluxiq-platform"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,23}$", var.name))
    error_message = "Use a lowercase name of 3-24 characters."
  }
}
variable "region" { type = string }
variable "availability_zone" { type = string }
variable "ubuntu_ami_id" {
  description = "Pinned official Ubuntu 24.04 LTS amd64 AMI in this region; no moving AMI lookup."
  type        = string
  validation {
    condition     = can(regex("^ami-[a-f0-9]+$", var.ubuntu_ami_id))
    error_message = "Supply a concrete Ubuntu 24.04 amd64 AMI id."
  }
}
variable "instance_type" {
  description = "Explicit x86_64 Nitro instance type; ARM/Graviton is not supported by this release."
  type        = string
}
variable "data_size_gb" {
  type    = number
  default = 40
  validation {
    condition     = var.data_size_gb > 0 && floor(var.data_size_gb) == var.data_size_gb
    error_message = "Data disk size must be a positive whole number of GiB."
  }
}
variable "config_secret_arn" {
  description = "Existing Secrets Manager secret ARN, never its value. Same AWS account/region as this VM."
  type        = string
  validation {
    condition     = can(regex("^arn:aws:secretsmanager:[a-z0-9-]+:[0-9]{12}:secret:[A-Za-z0-9/_+=.@-]+$", var.config_secret_arn))
    error_message = "Supply the exact commercial-AWS Secrets Manager secret ARN."
  }
}
variable "config_secret_kms_key_arn" {
  description = "Existing customer-managed KMS key ARN if the configuration secret uses one; key policy must admit the VM role."
  type        = string
  default     = null
}
variable "release" {
  description = "Public HTTPS release archive URL and verified archive SHA-256; no signed URLs."
  type        = object({ url = string, sha256 = string })
}
