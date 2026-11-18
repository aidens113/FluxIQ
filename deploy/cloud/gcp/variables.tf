variable "name" {
  type    = string
  default = "fluxiq-platform"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,23}$", var.name))
    error_message = "Use a lowercase name of 3-24 characters."
  }
}
variable "project" { type = string }
variable "region" { type = string }
variable "zone" { type = string }
variable "machine_type" {
  description = "Explicit amd64 Compute Engine machine type."
  type        = string
}
variable "ubuntu_image" {
  description = "Pinned official Ubuntu 24.04 amd64 image resource, never an image family."
  type        = string
  validation {
    condition     = can(regex("^projects/ubuntu-os-cloud/global/images/ubuntu-2404-noble-amd64-v[0-9]+$", var.ubuntu_image))
    error_message = "Supply a concrete versioned Ubuntu 24.04 amd64 image resource."
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
variable "config_secret_name" {
  description = "Existing Secret Manager secret name in this project; never its value."
  type        = string
  validation {
    condition     = can(regex("^[A-Za-z0-9_-]+$", var.config_secret_name))
    error_message = "Supply a secret name, not a path or value."
  }
}
variable "config_secret_version" {
  description = "Explicit numeric secret version; no moving latest alias."
  type        = string
  validation {
    condition     = can(regex("^[1-9][0-9]*$", var.config_secret_version))
    error_message = "Supply a numeric existing configuration secret version."
  }
}
variable "release" {
  type = object({ url = string, sha256 = string })
}
