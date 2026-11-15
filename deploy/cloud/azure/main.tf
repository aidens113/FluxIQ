terraform {
  required_version = ">= 1.9, < 2.0"
  required_providers {
    azurerm = { source = "hashicorp/azurerm", version = "~> 4.0" }
  }
}
provider "azurerm" {
  subscription_id = var.subscription_id
  features {}
}
resource "azurerm_resource_group" "platform" {
  name     = var.name
  location = var.location
}
resource "azurerm_virtual_network" "platform" {
  name                = var.name
  location            = var.location
  resource_group_name = azurerm_resource_group.platform.name
  address_space       = ["10.44.0.0/16"]
}
resource "azurerm_subnet" "platform" {
  name                 = "platform"
  resource_group_name  = azurerm_resource_group.platform.name
  virtual_network_name = azurerm_virtual_network.platform.name
  address_prefixes     = ["10.44.1.0/24"]
}
resource "azurerm_network_security_group" "edge" {
  name                = "${var.name}-edge"
  location            = var.location
  resource_group_name = azurerm_resource_group.platform.name
  security_rule {
    name                       = "tls-and-certificate-http"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_ranges    = ["80", "443"]
    source_address_prefix      = "Internet"
    destination_address_prefix = "*"
  }
  # Override Azure's default AllowVNetInBound, including private SSH/debug access.
  security_rule {
    name                       = "deny-other-inbound"
    priority                   = 200
    direction                  = "Inbound"
    access                     = "Deny"
    protocol                   = "*"
    source_port_range          = "*"
    destination_port_range     = "*"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }
}
resource "azurerm_public_ip" "edge" {
  name                = "${var.name}-edge"
  location            = var.location
  resource_group_name = azurerm_resource_group.platform.name
  allocation_method   = "Static"
  sku                 = "Standard"
}
resource "azurerm_network_interface" "platform" {
  name                = var.name
  location            = var.location
  resource_group_name = azurerm_resource_group.platform.name
  ip_configuration {
    name                          = "edge"
    subnet_id                     = azurerm_subnet.platform.id
    private_ip_address_allocation = "Dynamic"
    public_ip_address_id          = azurerm_public_ip.edge.id
  }
}
resource "azurerm_network_interface_security_group_association" "edge" {
  network_interface_id      = azurerm_network_interface.platform.id
  network_security_group_id = azurerm_network_security_group.edge.id
}
resource "azurerm_user_assigned_identity" "vm" {
  name                = "${var.name}-vm"
  location            = var.location
  resource_group_name = azurerm_resource_group.platform.name
}
resource "azurerm_role_assignment" "configuration" {
  scope                            = "${var.config_secret.vault_id}/secrets/${var.config_secret.name}"
  role_definition_name             = "Key Vault Secrets User"
  principal_id                     = azurerm_user_assigned_identity.vm.principal_id
  skip_service_principal_aad_check = true
}
resource "azurerm_managed_disk" "state" {
  name                 = "${var.name}-state"
  location             = var.location
  resource_group_name  = azurerm_resource_group.platform.name
  storage_account_type = "StandardSSD_LRS"
  create_option        = "Empty"
  disk_size_gb         = var.data_size_gb
  # Azure platform-managed encryption at rest; no private/raw keys in state.
  lifecycle { prevent_destroy = true }
}
module "bootstrap" {
  source = "../bootstrap"
  config = {
    provider           = "azure"
    region             = var.location
    release_url        = var.release.url
    release_sha256     = var.release.sha256
    config_secret      = "https://${basename(var.config_secret.vault_id)}.vault.azure.net/secrets/${var.config_secret.name}/${var.config_secret.version}"
    identity_client_id = azurerm_user_assigned_identity.vm.client_id
    data_device        = "/dev/disk/azure/scsi1/lun0"
  }
}
resource "azurerm_linux_virtual_machine" "platform" {
  name                            = var.name
  location                        = var.location
  resource_group_name             = azurerm_resource_group.platform.name
  size                            = var.vm_size
  admin_username                  = "fluxiqoperator"
  disable_password_authentication = true
  network_interface_ids           = [azurerm_network_interface.platform.id]
  custom_data                     = base64encode(module.bootstrap.cloud_init)
  disk_controller_type            = "SCSI"
  secure_boot_enabled             = true
  vtpm_enabled                    = true
  # Azure requires an admin public key; no SSH port is admitted and no private key enters Terraform.
  admin_ssh_key {
    username   = "fluxiqoperator"
    public_key = var.admin_public_key
  }
  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.vm.id]
  }
  os_disk {
    caching              = "ReadWrite"
    storage_account_type = "StandardSSD_LRS"
    disk_size_gb         = 30
  }
  source_image_reference {
    publisher = var.ubuntu_image.publisher
    offer     = var.ubuntu_image.offer
    sku       = var.ubuntu_image.sku
    version   = var.ubuntu_image.version
  }
  depends_on = [azurerm_role_assignment.configuration, azurerm_network_interface_security_group_association.edge]
}
resource "azurerm_virtual_machine_data_disk_attachment" "state" {
  managed_disk_id    = azurerm_managed_disk.state.id
  virtual_machine_id = azurerm_linux_virtual_machine.platform.id
  lun                = 0
  caching            = "None"
}

output "public_ip" { value = azurerm_public_ip.edge.ip_address }
output "instance_id" { value = azurerm_linux_virtual_machine.platform.id }
output "retained_state_disk" { value = azurerm_managed_disk.state.id }
output "runtime_identity" { value = azurerm_user_assigned_identity.vm.principal_id }
