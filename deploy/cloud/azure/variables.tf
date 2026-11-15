variable "name" {
  type    = string
  default = "fluxiq-platform"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,23}$", var.name))
    error_message = "Use a lowercase name of 3-24 characters."
  }
}
variable "subscription_id" { type = string }
variable "location" { type = string }
variable "vm_size" {
  description = "Explicit amd64 SCSI-capable VM size supporting Trusted Launch."
  type        = string
}
variable "ubuntu_image" {
  description = "Concrete Ubuntu 24.04 amd64 Gen2 marketplace version; latest is refused."
  type        = object({ publisher = string, offer = string, sku = string, version = string })
  validation {
    condition     = lower(var.ubuntu_image.publisher) == "canonical" && var.ubuntu_image.offer == "ubuntu-24_04-lts" && var.ubuntu_image.sku == "server" && can(regex("^[0-9]+\\.[0-9]+\\.[0-9]+$", var.ubuntu_image.version))
    error_message = "Supply a pinned Canonical ubuntu-24_04-lts:server amd64 Gen2 version, never latest."
  }
}
variable "admin_public_key" {
  description = "Existing SSH public key only, required by Azure VM API; no inbound SSH rule is created."
  type        = string
  validation {
    condition     = can(regex("^ssh-(rsa|ed25519) [A-Za-z0-9+/]+=*", var.admin_public_key))
    error_message = "Supply an SSH public key, never a private key or password."
  }
}
variable "data_size_gb" {
  type    = number
  default = 40
  validation {
    condition     = var.data_size_gb > 0 && floor(var.data_size_gb) == var.data_size_gb
    error_message = "Data disk size must be a positive whole number of GiB."
  }
}
variable "config_secret" {
  description = "Existing RBAC-enabled public-cloud Key Vault secret references, never the secret's contents."
  type        = object({ vault_id = string, name = string, version = string })
  validation {
    condition     = can(regex("^/subscriptions/[^/]+/resourceGroups/[^/]+/providers/Microsoft.KeyVault/vaults/[a-zA-Z0-9-]+$", var.config_secret.vault_id)) && can(regex("^[a-zA-Z0-9-]+$", var.config_secret.name)) && can(regex("^[a-f0-9]{32}$", var.config_secret.version))
    error_message = "Supply the vault ARM resource id, secret name and explicit 32-hex secret version."
  }
}
variable "release" {
  type = object({ url = string, sha256 = string })
}
