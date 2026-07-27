export type IdentityAccessPanel = "users" | "roles" | "sessions" | "vault";

export type IdentityAccessViewState = {
  activePanel: IdentityAccessPanel;
  selectedUserId?: string;
  selectedRoleId?: string;
};
