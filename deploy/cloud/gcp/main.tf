terraform {
  required_version = ">= 1.9, < 2.0"
  required_providers {
    google = { source = "hashicorp/google", version = "~> 6.0" }
  }
}
provider "google" {
  project = var.project
  region  = var.region
  zone    = var.zone
}
resource "google_project_service" "required" {
  for_each           = toset(["compute.googleapis.com", "iam.googleapis.com", "secretmanager.googleapis.com"])
  project            = var.project
  service            = each.value
  disable_on_destroy = false
}
resource "google_compute_network" "platform" {
  name                    = var.name
  auto_create_subnetworks = false
  depends_on              = [google_project_service.required]
}
resource "google_compute_subnetwork" "platform" {
  name          = var.name
  region        = var.region
  network       = google_compute_network.platform.id
  ip_cidr_range = "10.43.1.0/24"
  stack_type    = "IPV4_ONLY"
}
resource "google_compute_firewall" "edge" {
  name          = "${var.name}-edge"
  network       = google_compute_network.platform.name
  direction     = "INGRESS"
  source_ranges = ["0.0.0.0/0"]
  target_tags   = [var.name]
  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }
}
resource "google_service_account" "vm" {
  account_id   = "${var.name}-vm"
  display_name = "FluxIQ runtime configuration reader"
  depends_on   = [google_project_service.required]
}
resource "google_secret_manager_secret_iam_member" "configuration" {
  project   = var.project
  secret_id = var.config_secret_name
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.vm.email}"
}
resource "google_compute_disk" "state" {
  name       = "${var.name}-state"
  zone       = var.zone
  type       = "pd-balanced"
  size       = var.data_size_gb
  depends_on = [google_project_service.required]
  # Google-managed encryption at rest. No raw encryption keys in Terraform.
  lifecycle { prevent_destroy = true }
}
resource "google_compute_address" "edge" {
  name       = "${var.name}-edge"
  region     = var.region
  depends_on = [google_project_service.required]
}
module "bootstrap" {
  source = "../bootstrap"
  config = {
    provider       = "gcp"
    region         = var.region
    release_url    = var.release.url
    release_sha256 = var.release.sha256
    config_secret  = "projects/${var.project}/secrets/${var.config_secret_name}/versions/${var.config_secret_version}"
    data_device    = "/dev/disk/by-id/google-fluxiq-data"
  }
}
resource "terraform_data" "bootstrap_revision" { input = sha256(module.bootstrap.cloud_init) }
resource "google_compute_instance" "platform" {
  name                      = var.name
  zone                      = var.zone
  machine_type              = var.machine_type
  allow_stopping_for_update = true
  tags                      = [var.name]
  boot_disk {
    initialize_params {
      image = var.ubuntu_image
      size  = 24
      type  = "pd-balanced"
    }
  }
  attached_disk {
    source      = google_compute_disk.state.id
    device_name = "fluxiq-data"
  }
  network_interface {
    subnetwork = google_compute_subnetwork.platform.id
    access_config { nat_ip = google_compute_address.edge.address }
  }
  metadata = {
    user-data                = module.bootstrap.cloud_init
    enable-oslogin           = "TRUE"
    block-project-ssh-keys   = "TRUE"
    disable-legacy-endpoints = "TRUE"
  }
  service_account {
    email  = google_service_account.vm.email
    scopes = ["https://www.googleapis.com/auth/cloud-platform"]
  }
  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }
  # Updating GCE metadata alone does not rerun cloud-init: replace the VM, retain its disk/IP.
  lifecycle { replace_triggered_by = [terraform_data.bootstrap_revision] }
  depends_on = [google_secret_manager_secret_iam_member.configuration]
}

output "public_ip" { value = google_compute_address.edge.address }
output "instance_name" { value = google_compute_instance.platform.name }
output "retained_state_disk" { value = google_compute_disk.state.id }
output "runtime_identity" { value = google_service_account.vm.email }
