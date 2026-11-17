terraform {
  required_version = ">= 1.9, < 2.0"
}

variable "config" {
  description = "Nonsecret bootstrap references only. Secret values and credentials never belong in Terraform."
  type = object({
    provider           = string
    region             = string
    release_url        = string
    release_sha256     = string
    config_secret      = string
    identity_client_id = optional(string, "")
    data_device        = optional(string, "")
    data_volume_id     = optional(string, "")
  })
  validation {
    condition     = contains(["aws", "gcp", "azure"], var.config.provider)
    error_message = "Unsupported cloud provider."
  }
  validation {
    condition     = can(regex("^https://[A-Za-z0-9.-]+(:443)?/[A-Za-z0-9._~/%+-]+$", var.config.release_url))
    error_message = "Release URL must be public HTTPS, without credentials, signed queries or fragments."
  }
  validation {
    condition     = can(regex("^[a-f0-9]{64}$", var.config.release_sha256)) && length(toset(split("", var.config.release_sha256))) > 1
    error_message = "Supply the actual lowercase SHA-256 of the release archive."
  }
}

output "cloud_init" {
  value = templatefile("${path.module}/../runtime/cloud-init.yml.tftpl", {
    config         = base64encode(jsonencode(var.config))
    install        = filebase64("${path.module}/../runtime/install.sh")
    mount_data     = filebase64("${path.module}/../runtime/mount-data.sh")
    metadata_guard = filebase64("${path.module}/../runtime/metadata-guard.sh")
    fetch_config   = filebase64("${path.module}/../runtime/fetch-config.py")
    write_config   = filebase64("${path.module}/../runtime/write-config.py")
    extract        = filebase64("${path.module}/../runtime/extract-release.py")
  })
}
