"use client";

import { Copy, KeyRound, MoreHorizontal, QrCode, Search, ShieldCheck, UserPlus, UserRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { IdentityAccessSnapshotResponse, User } from "fluxiq/identity-access";
import { useProgramApi, type ApiResponse, type JsonObject } from "../program-api";
import { DataTable, EmptyState, Field, KeyValue, LoadingState, Menu, Modal, Panel, Segmented, StatusBadge, StatusText, VisualAlert, type AlertTone } from "../shared-ui";
import type { CurrentUser } from "../types";
import { OperationBusyBoundary, useOperationLock } from "../use-operation-lock";
import { reconcileVisibleSelection } from "../program-selection";
import { copyText, digits, emptyCredentialEdit, formatTime } from "./shared";

type IdentityView = "Users" | "Roles" | "Authentication Policy";
type CredentialEdit = { kind: "password" | "pin"; value: string; confirm: string; authorizationPassword: string; authorizationPin: string; authorizationTotp: string };

export function visibleIdentityUsers(users: User[], query: string, enabledFilter: "all" | "enabled" | "disabled"): User[] {
  const normalized = query.trim().toLocaleLowerCase();
  return users.filter((user) => {
    if (enabledFilter === "enabled" && !user.enabled) return false;
    if (enabledFilter === "disabled" && user.enabled) return false;
    return !normalized || [user.displayName, user.username, user.roleId].some((value) => value.toLocaleLowerCase().includes(normalized));
  });
}

export function isLastEnabledAdmin(users: User[], user: User): boolean {
  return user.enabled && user.roleId === "admin" && users.filter((item) => item.enabled && item.roleId === "admin").length === 1;
}

export function IdentityAccessLive({ currentUser }: { currentUser: CurrentUser }) {
  const api = useProgramApi("identity-access");
  const [snapshot, setSnapshot] = useState<ApiResponse<IdentityAccessSnapshotResponse> | null>(null);
  const [activeView, setActiveView] = useState<IdentityView>("Users");
  const [status, setStatus] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [query, setQuery] = useState("");
  const [enabledFilter, setEnabledFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [newUser, setNewUser] = useState({ username: "", displayName: "", roleId: "viewer", password: "", pin: "", enabled: true });
  const [profileEdit, setProfileEdit] = useState<{ id: string; username: string; displayName: string } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpSetup, setTotpSetup] = useState<{ secret: string; otpauthUrl: string; qrSvg: string; issuer: string; accountLabel: string } | null>(null);
  const [credentialEdit, setCredentialEdit] = useState<CredentialEdit | null>(null);
  const [credentialAlert, setCredentialAlert] = useState<{ tone: AlertTone; message: string } | null>(null);
  const [roleEdit, setRoleEdit] = useState<{ userId: string; roleId: string; password: string; pin: string; totp: string } | null>(null);
  const [roleAlert, setRoleAlert] = useState<{ tone: AlertTone; message: string } | null>(null);
  const [totpDisable, setTotpDisable] = useState<{ userId: string; authorizationPassword: string; authorizationPin: string; authorizationTotp: string; error: string } | null>(null);
  const operation = useOperationLock();

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const result = await api.get<IdentityAccessSnapshotResponse>("snapshot", signal ? { signal } : {});
    if (!result.aborted) setSnapshot(result);
  }, [api]);
  useEffect(() => { const controller = new AbortController(); void refresh(controller.signal); return () => controller.abort(); }, [refresh]);
  const users = snapshot?.payload?.users ?? [];
  const roles = snapshot?.payload?.roles ?? [];
  const sessions = snapshot?.payload?.sessions ?? [];
  const actorUser = users.find((user) => user.id === currentUser.id);
  const actorPinConfigured = Boolean(actorUser?.pinConfigured);
  const filteredUsers = useMemo(() => visibleIdentityUsers(users, query, enabledFilter), [enabledFilter, query, users]);
  const visibleUserId = reconcileVisibleSelection(filteredUsers, selectedUserId, (user) => user.id);
  const selectedUser = filteredUsers.find((user) => user.id === visibleUserId);
  useEffect(() => {
    const nextId = selectedUser?.id ?? "";
    if (selectedUserId !== nextId) setSelectedUserId(nextId);
  }, [selectedUser?.id, selectedUserId]);

  async function createUser() {
    await operation.run("create-user", async () => {
      const result = await api.post("create-user", newUser);
      if (!result.ok) { setStatus(result.error ?? "Create failed"); return; }
      setStatus("User created");
      setNewUser({ username: "", displayName: "", roleId: "viewer", password: "", pin: "", enabled: true });
      setCreateOpen(false);
      await refresh();
    });
  }

  async function updateUser(user: User, patch: JsonObject) {
    return operation.run("update-user", async () => {
      const result = await api.post("update-user", { id: user.id, ...patch });
      setStatus(result.ok ? "User updated" : result.error ?? "Update failed");
      if (result.ok) await refresh();
      return result.ok;
    });
  }

  async function saveProfile() {
    if (!profileEdit) return;
    const user = users.find((item) => item.id === profileEdit.id);
    if (!user) return;
    if (await updateUser(user, { username: profileEdit.username, displayName: profileEdit.displayName })) setProfileEdit(null);
  }

  async function saveRoleEdit() {
    if (!roleEdit) return;
    await operation.run("update-role", async () => {
      const result = await api.post("update-user", { id: roleEdit.userId, roleId: roleEdit.roleId, authorizationPassword: roleEdit.password, authorizationPin: roleEdit.pin, authorizationTotp: roleEdit.totp });
      if (result.ok) { setStatus("Role updated"); setRoleAlert(null); setRoleEdit(null); await refresh(); }
      else setRoleAlert({ tone: "error", message: result.error ?? "Role update failed." });
    });
  }

  async function saveCredential() {
    if (!selectedUser || !credentialEdit || credentialEdit.value !== credentialEdit.confirm) { setCredentialAlert({ tone: "error", message: "Credential values must match." }); return; }
    const draft = credentialEdit;
    await operation.run("update-credential", async () => {
      const endpoint = draft.kind === "password" ? "set-password" : "set-pin";
      const result = await api.post(endpoint, { userId: selectedUser.id, value: draft.value, authorizationPassword: draft.authorizationPassword, authorizationPin: draft.authorizationPin, authorizationTotp: draft.authorizationTotp });
      if (result.ok) { setStatus(draft.kind + " updated"); setCredentialAlert(null); setCredentialEdit(null); await refresh(); }
      else setCredentialAlert({ tone: "error", message: result.error ?? "Credential update failed." });
    });
  }

  async function beginTotp(userId = selectedUser?.id) {
    if (!userId) return;
    await operation.run("begin-totp", async () => {
      const result = await api.post<{ secret: string; otpauthUrl: string; qrSvg: string; issuer: string; accountLabel: string }>("begin-totp", { userId });
      if (result.ok) { setTotpSetup(result.payload ?? null); setTotpCode(""); setStatus("2FA setup started"); }
      else setStatus(result.error ?? "2FA setup failed");
    });
  }

  async function confirmTotp() {
    if (!selectedUser) return;
    await operation.run("confirm-totp", async () => {
      const result = await api.post("confirm-totp", { userId: selectedUser.id, code: totpCode });
      setStatus(result.ok ? "2FA enabled" : result.error ?? "2FA confirmation failed");
      if (result.ok) { setTotpSetup(null); await refresh(); }
    });
  }

  async function disableTotp() {
    if (!totpDisable) return;
    const draft = totpDisable;
    await operation.run("disable-totp", async () => {
      const result = await api.post("disable-totp", draft);
      if (!result.ok) { setTotpDisable({ ...draft, error: result.error ?? "2FA disable failed." }); return; }
      setStatus("2FA disabled");
      setTotpDisable(null);
      await refresh();
    });
  }

  function beginCredential(user: User, kind: "password" | "pin") {
    setSelectedUserId(user.id);
    setCredentialAlert(null);
    setCredentialEdit(emptyCredentialEdit(kind));
  }

  if (!snapshot) return <LoadingState label="Loading identity and access" detail="Retrieving users, roles, sessions, and authentication policy." />;
  if (!snapshot.ok) return <EmptyState title="Identity and access unavailable" description={snapshot.error ?? "The identity service could not be loaded."} action={<button className="button" onClick={() => void refresh()} type="button">Retry</button>} />;

  return (
    <OperationBusyBoundary busy={operation.busy}><section aria-busy={operation.busy || undefined} className="identity-access-workspace">
      <header className="program-inner-header">
        <div><strong>Identity and Access</strong><span>Manage accounts, roles, credentials, and authentication policy.</span></div>
        <StatusText value={operation.activeOperation ? `Identity operation in progress: ${operation.activeOperation}` : status} />
      </header>
      <Segmented label="Identity and Access view" options={["Users", "Roles", "Authentication Policy"]} value={activeView} onChange={(value) => setActiveView(value as IdentityView)} />

      {activeView === "Users" ? <div className="identity-users-layout">
        <Panel title="Users" action={<button className="button button-primary" disabled={operation.busy} onClick={() => setCreateOpen(true)} type="button"><UserPlus size={14} aria-hidden />Add User</button>}>
          <div className="program-list-toolbar">
            <label className="program-search-field"><Search size={14} aria-hidden /><input aria-label="Search users" onChange={(event) => setQuery(event.target.value)} placeholder="Search name, username, or role" type="search" value={query} /></label>
            <select aria-label="Filter users" onChange={(event) => setEnabledFilter(event.target.value as typeof enabledFilter)} value={enabledFilter}><option value="all">All users</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select>
          </div>
          <DataTable label="Identity users" columns={["User", "Role", "2FA", "Status", "Actions"]} rows={filteredUsers.map((user) => {
            const protectedAdmin = isLastEnabledAdmin(users, user);
            return [
              <button aria-current={selectedUser?.id === user.id ? "true" : undefined} className="identity-user-link" onClick={() => setSelectedUserId(user.id)} type="button"><strong>{user.displayName}</strong><small>@{user.username}</small></button>,
              user.roleId,
              <StatusBadge value={user.totpEnabled ? "Enabled" : "Off"} />,
              <StatusBadge value={user.enabled ? "Enabled" : "Disabled"} />,
              <Menu icon={<MoreHorizontal size={15} aria-hidden />} iconOnly label={"Actions for " + user.displayName} options={[
                { id: "profile", label: "Edit profile", onSelect: () => { setSelectedUserId(user.id); setProfileEdit({ id: user.id, username: user.username, displayName: user.displayName }); } },
                { id: "role", label: "Change role", disabled: protectedAdmin, onSelect: () => { setSelectedUserId(user.id); setRoleAlert(null); setRoleEdit({ userId: user.id, roleId: user.roleId, password: "", pin: "", totp: "" }); } },
                { id: "password", label: "Change password", onSelect: () => beginCredential(user, "password") },
                { id: "pin", label: "Change PIN", onSelect: () => beginCredential(user, "pin") },
                { id: "totp", label: user.totpEnabled ? "Disable 2FA" : "Set up 2FA", onSelect: () => { setSelectedUserId(user.id); if (user.totpEnabled) setTotpDisable({ userId: user.id, authorizationPassword: "", authorizationPin: "", authorizationTotp: "", error: "" }); else void beginTotp(user.id); } },
                { id: "enabled", label: user.enabled ? "Disable user" : "Enable user", danger: user.enabled, disabled: protectedAdmin, onSelect: () => void updateUser(user, { enabled: !user.enabled }) }
              ]} />
            ];
          })} empty={users.length ? "No users match these filters." : "No users have been created."} />
        </Panel>
        <Panel title="User Detail">
          {selectedUser ? <div className="identity-user-detail">
            <div className="identity-user-heading"><span className="program-icon"><UserRound size={18} aria-hidden /></span><div><strong>{selectedUser.displayName}</strong><small>@{selectedUser.username}</small></div><StatusBadge value={selectedUser.enabled ? "Enabled" : "Disabled"} /></div>
            <KeyValue rows={[["Role", selectedUser.roleId], ["Password", selectedUser.passwordConfigured ? "Configured" : "Not configured"], ["PIN", selectedUser.pinConfigured ? "Configured" : "Not configured"], ["Two-factor", selectedUser.totpEnabled ? "Enabled" : "Off"], ["Created", formatTime(selectedUser.createdAtMs)], ["Last updated", formatTime(selectedUser.updatedAtMs)], ["Active sessions", String(sessions.filter((session) => session.userId === selectedUser.id).length)]]} />
            {isLastEnabledAdmin(users, selectedUser) ? <VisualAlert tone="warning" title="Last enabled administrator" message="Add or enable another administrator before disabling this account or changing its role." /> : null}
          </div> : <EmptyState compact title="No user selected" description="Choose a user to inspect account and authentication details." />}
        </Panel>
      </div> : null}

      {activeView === "Roles" ? <Panel title="Roles and permissions"><DataTable label="Identity roles and permissions" columns={["Role", "Permissions", "Users"]} rows={roles.map((role) => [<strong key={role.id}>{role.id}</strong>, role.permissions.join(", "), String(users.filter((user) => user.roleId === role.id).length)])} empty="No roles are configured." /></Panel> : null}

      {activeView === "Authentication Policy" ? <div className="identity-policy-grid">
        <Panel title="Authentication"><KeyValue rows={[["Password", "Required for account login and privileged authorization"], ["PIN", "Optional per user; required when configured"], ["Two-factor", "Optional per user; required for privileged authorization when enabled"], ["Session owner", currentUser.displayName], ["Active sessions", String(sessions.length)]]} /></Panel>
        <Panel title="Credential Vault"><div className="identity-policy-summary"><span className="program-icon"><ShieldCheck size={18} aria-hidden /></span><div><strong>{snapshot.payload?.vault.unlocked ? "Unlocked" : "Locked"}</strong><small>{snapshot.payload?.vault.initialized ? "Encrypted credential storage initialized" : "Vault initializes when first configured"}</small></div></div><KeyValue rows={[["Encrypted fields", String(snapshot.payload?.vault.encryptedFieldCount ?? 0)], ["Unlocked by", snapshot.payload?.vault.unlockedBy ?? "-"], ["Unlocked at", formatTime(snapshot.payload?.vault.unlockedAtMs)]]} /></Panel>
        <VisualAlert tone="info" title="Security consequences" message="Role changes and credential replacement require the acting user's current authorization factors. Disabling a user invalidates future login, and the final enabled administrator is protected." />
      </div> : null}

      {createOpen ? <Modal title="Add User" description="Create a framework account with an initial role and temporary credentials." onClose={() => setCreateOpen(false)}>
        <div className="dialog-form"><Field label="Username" required><input autoComplete="username" data-autofocus value={newUser.username} onChange={(event) => setNewUser({ ...newUser, username: event.target.value })} /></Field><Field label="Display name" required><input value={newUser.displayName} onChange={(event) => setNewUser({ ...newUser, displayName: event.target.value })} /></Field><Field label="Role" required><select value={newUser.roleId} onChange={(event) => setNewUser({ ...newUser, roleId: event.target.value })}>{roles.map((role) => <option key={role.id} value={role.id}>{role.id}</option>)}</select></Field><Field label="Temporary password" required><input autoComplete="new-password" type="password" value={newUser.password} onChange={(event) => setNewUser({ ...newUser, password: event.target.value })} /></Field><Field hint="Leave blank when this account does not require a PIN." label="PIN"><input inputMode="numeric" value={newUser.pin} onChange={(event) => setNewUser({ ...newUser, pin: digits(event.target.value) })} /></Field><label className="check-row"><input checked={newUser.enabled} onChange={(event) => setNewUser({ ...newUser, enabled: event.target.checked })} type="checkbox" />Enabled at creation</label></div>
        <div className="modal-actions"><button className="button" onClick={() => setCreateOpen(false)} type="button">Cancel</button><button className="button button-primary" disabled={!newUser.username.trim() || !newUser.displayName.trim() || !newUser.password || (newUser.pin.length > 0 && newUser.pin.length < 4)} onClick={() => void createUser()} type="button">Create User</button></div>
      </Modal> : null}

      {profileEdit ? <Modal title="Edit User Profile" onClose={() => setProfileEdit(null)}><div className="dialog-form"><Field label="Display name" required><input data-autofocus value={profileEdit.displayName} onChange={(event) => setProfileEdit({ ...profileEdit, displayName: event.target.value })} /></Field><Field label="Username" required><input value={profileEdit.username} onChange={(event) => setProfileEdit({ ...profileEdit, username: event.target.value })} /></Field></div><div className="modal-actions"><button className="button" onClick={() => setProfileEdit(null)} type="button">Cancel</button><button className="button button-primary" disabled={!profileEdit.displayName.trim() || !profileEdit.username.trim()} onClick={() => void saveProfile()} type="button">Save Profile</button></div></Modal> : null}

      {totpSetup ? <Modal title="Set Up Two-Factor Authentication" description={"Enroll an authenticator for " + (selectedUser?.displayName ?? "this user") + "."} onClose={() => { setTotpSetup(null); setTotpCode(""); }}><div className="totp-enrollment"><div className="totp-qr-card"><div className="totp-qr-frame" dangerouslySetInnerHTML={{ __html: String(totpSetup.qrSvg ?? "") }} /><span>Scan with an authenticator app</span></div><div className="totp-enrollment-steps"><VisualAlert tone="info" title="Authenticator setup" message="Scan the QR code or enter the manual key, then provide the current six-digit code." /><div className="secret-copy-row"><span><strong>Manual key</strong><code>{totpSetup.secret}</code></span><button className="button" onClick={() => void copyText(String(totpSetup.secret ?? ""))} type="button"><Copy size={14} aria-hidden />Copy</button></div><details className="otpauth-details"><summary>Advanced URI</summary><code>{totpSetup.otpauthUrl}</code></details><Field label="Six-digit code" required><input data-autofocus inputMode="numeric" value={totpCode} onChange={(event) => setTotpCode(digits(event.target.value).slice(0, 6))} /></Field></div></div><div className="modal-actions"><button className="button" onClick={() => { setTotpSetup(null); setTotpCode(""); }} type="button">Cancel</button><button className="button button-primary" disabled={totpCode.length !== 6} onClick={() => void confirmTotp()} type="button"><QrCode size={14} aria-hidden />Enable 2FA</button></div></Modal> : null}

      {credentialEdit ? <Modal title={"Change " + credentialEdit.kind} description={"Replace the selected user's " + credentialEdit.kind + " after authorizing this privileged action."} onClose={() => setCredentialEdit(null)}>{credentialAlert ? <VisualAlert tone={credentialAlert.tone} title="Credential update" message={credentialAlert.message} /> : null}<div className="dialog-form"><Field label="New value" required><input autoComplete="new-password" data-autofocus inputMode={credentialEdit.kind === "pin" ? "numeric" : undefined} type={credentialEdit.kind === "password" ? "password" : "text"} value={credentialEdit.value} onChange={(event) => setCredentialEdit({ ...credentialEdit, value: credentialEdit.kind === "pin" ? digits(event.target.value) : event.target.value })} /></Field><Field label="Confirm value" required><input autoComplete="new-password" inputMode={credentialEdit.kind === "pin" ? "numeric" : undefined} type={credentialEdit.kind === "password" ? "password" : "text"} value={credentialEdit.confirm} onChange={(event) => setCredentialEdit({ ...credentialEdit, confirm: credentialEdit.kind === "pin" ? digits(event.target.value) : event.target.value })} /></Field><AuthorizationFields currentUser={currentUser} pinConfigured={actorPinConfigured} value={credentialEdit} onChange={(authorization) => setCredentialEdit({ ...credentialEdit, ...authorization })} /></div><div className="modal-actions"><button className="button" onClick={() => setCredentialEdit(null)} type="button">Cancel</button><button className="button button-primary" disabled={!credentialEdit.value || credentialEdit.value !== credentialEdit.confirm || !credentialEdit.authorizationPassword || (actorPinConfigured && credentialEdit.authorizationPin.length < 4) || (currentUser.totpEnabled && credentialEdit.authorizationTotp.length !== 6)} onClick={() => void saveCredential()} type="button"><KeyRound size={14} aria-hidden />Save Credential</button></div></Modal> : null}

      {totpDisable ? <Modal title="Disable Two-Factor Authentication" description={"Remove authenticator protection from " + (selectedUser?.displayName ?? "this user") + "."} onClose={() => setTotpDisable(null)}>{totpDisable.error ? <VisualAlert tone="error" title="Authorization failed" message={totpDisable.error} /> : null}<div className="dialog-form"><VisualAlert tone="warning" title="Security impact" message="This user will be able to sign in without an authenticator code after this change." /><AuthorizationFields currentUser={currentUser} pinConfigured={actorPinConfigured} value={totpDisable} onChange={(authorization) => setTotpDisable({ ...totpDisable, ...authorization, error: "" })} /></div><div className="modal-actions"><button className="button" onClick={() => setTotpDisable(null)} type="button">Cancel</button><button className="button button-danger" disabled={!totpDisable.authorizationPassword || (actorPinConfigured && totpDisable.authorizationPin.length < 4) || (currentUser.totpEnabled && totpDisable.authorizationTotp.length !== 6)} onClick={() => void disableTotp()} type="button">Disable 2FA</button></div></Modal> : null}

      {roleEdit ? <Modal title="Change Role" description="Changing permissions affects what this user can view and control." onClose={() => setRoleEdit(null)}>{roleAlert ? <VisualAlert tone={roleAlert.tone} title="Role update" message={roleAlert.message} /> : null}<div className="dialog-form"><Field label="Role" required><select data-autofocus value={roleEdit.roleId} onChange={(event) => setRoleEdit({ ...roleEdit, roleId: event.target.value })}>{roles.map((role) => <option key={role.id} value={role.id}>{role.id}</option>)}</select></Field><AuthorizationFields currentUser={currentUser} pinConfigured={actorPinConfigured} value={{ authorizationPassword: roleEdit.password, authorizationPin: roleEdit.pin, authorizationTotp: roleEdit.totp }} onChange={(value) => setRoleEdit({ ...roleEdit, password: value.authorizationPassword, pin: value.authorizationPin, totp: value.authorizationTotp })} /></div><div className="modal-actions"><button className="button" onClick={() => setRoleEdit(null)} type="button">Cancel</button><button className="button button-primary" disabled={!roleEdit.password || (actorPinConfigured && roleEdit.pin.length < 4) || (currentUser.totpEnabled && roleEdit.totp.length !== 6)} onClick={() => void saveRoleEdit()} type="button">Save Role</button></div></Modal> : null}
    </section></OperationBusyBoundary>
  );
}

function AuthorizationFields(props: { currentUser: CurrentUser; pinConfigured: boolean; value: { authorizationPassword: string; authorizationPin: string; authorizationTotp: string }; onChange(value: { authorizationPassword: string; authorizationPin: string; authorizationTotp: string }): void }) {
  return <><VisualAlert tone="warning" title="Authorization required" message="Use the acting user's current security factors to approve this change." /><Field label="Your current password" required><input autoComplete="current-password" type="password" value={props.value.authorizationPassword} onChange={(event) => props.onChange({ ...props.value, authorizationPassword: event.target.value })} /></Field>{props.pinConfigured ? <Field label="Your current PIN" required><input inputMode="numeric" value={props.value.authorizationPin} onChange={(event) => props.onChange({ ...props.value, authorizationPin: digits(event.target.value) })} /></Field> : null}{props.currentUser.totpEnabled ? <Field label="Your 2FA code" required><input autoComplete="one-time-code" inputMode="numeric" value={props.value.authorizationTotp} onChange={(event) => props.onChange({ ...props.value, authorizationTotp: digits(event.target.value).slice(0, 6) })} /></Field> : null}</>;
}
