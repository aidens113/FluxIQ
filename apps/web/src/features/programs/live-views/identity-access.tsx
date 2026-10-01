"use client";

import { KeyRound, MoreHorizontal, QrCode, Search, ShieldCheck, UserPlus, UserRound } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import type { IdentityAccessSnapshotResponse, User } from "fluxiq/identity-access";
import { useProgramApi, type ApiResponse, type JsonObject } from "../program-api";
import { DataTable, EmptyState, Field, KeyValue, LoadingState, Menu, Modal, Panel, Segmented, StatusBadge, StatusText, VisualAlert, type AlertTone } from "../shared-ui";
import type { CurrentUser } from "../types";
import { OperationBusyBoundary, useOperationLock } from "../use-operation-lock";
import { reconcileVisibleSelection } from "../program-selection";
import { digits, emptyCredentialEdit, formatTime } from "./shared";
import { ClipboardButton } from "../components";

type IdentityView = "Users" | "Roles" | "Authentication Policy";
type CredentialEdit = { userId: string; kind: "password" | "pin"; value: string; confirm: string; authorizationPassword: string; authorizationPin: string; authorizationTotp: string };

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
  const ownerRef = useRef({ api, actorId: currentUser.id, generation: 0 });
  if (ownerRef.current.api !== api || ownerRef.current.actorId !== currentUser.id) ownerRef.current = { api, actorId: currentUser.id, generation: ownerRef.current.generation + 1 };
  const owner = ownerRef.current;
  const isOwnerCurrent = useCallback(() => ownerRef.current === owner, [owner]);
  return <IdentityWorkspace key={owner.generation} api={api} currentUser={currentUser} isOwnerCurrent={isOwnerCurrent} />;
}

function IdentityWorkspace({ api, currentUser, isOwnerCurrent }: { api: ReturnType<typeof useProgramApi>; currentUser: CurrentUser; isOwnerCurrent(): boolean }) {
  const mounted = useRef(false);
  const current = () => mounted.current && isOwnerCurrent();
  const [snapshot, setSnapshot] = useState<ApiResponse<IdentityAccessSnapshotResponse> | null>(null);
  const [readError, setReadError] = useState("");
  const [readLoading, setReadLoading] = useState(true);
  const readJob = useRef({ id: 0, controller: null as AbortController | null });
  const users = snapshot?.payload?.users ?? [];
  const roles = snapshot?.payload?.roles ?? [];
  const sessions = snapshot?.payload?.sessions ?? [];
  const usersRef = useRef(users); usersRef.current = users;
  const actorUser = users.find((user) => user.id === currentUser.id);
  const actorPinConfigured = Boolean(actorUser?.pinConfigured);
  const policy = JSON.stringify([currentUser.roleId, actorPinConfigured, currentUser.totpEnabled]);
  const subjectExists = (value: { userId: string } | null) => !value || users.some((user) => user.id === value.userId);
  const [activeView, setActiveView] = useState<IdentityView>("Users");
  const [status, setStatus] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [query, setQuery] = useState("");
  const [enabledFilter, setEnabledFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [createOpen, setCreateOpen, createCurrent] = useIdentityDialog(false, current, policy);
  const [newUser, setNewUser, newUserCurrent] = useIdentityDialog(emptyNewUser(), current, policy);
  const [profileEdit, setProfileEdit, profileCurrent] = useIdentityDialog<{ id: string; username: string; displayName: string } | null>(null, current, "profile", (value) => !value || users.some((user) => user.id === value.id));
  const [totpCode, setTotpCode] = useIdentityDialog("", current, policy);
  const [totpSetup, setTotpSetup, setupCurrent] = useIdentityDialog<{ userId: string; secret: string; otpauthUrl: string; qrSvg: string; issuer: string; accountLabel: string } | null>(null, current, policy, subjectExists);
  const [credentialEdit, setCredentialEdit, credentialCurrent] = useIdentityDialog<CredentialEdit | null>(null, current, policy, subjectExists);
  const [credentialAlert, setCredentialAlert] = useState<{ tone: AlertTone; message: string } | null>(null);
  const [roleEdit, setRoleEdit, roleCurrent] = useIdentityDialog<{ userId: string; roleId: string; password: string; pin: string; totp: string } | null>(null, current, policy, subjectExists);
  const [roleAlert, setRoleAlert] = useState<{ tone: AlertTone; message: string } | null>(null);
  const [totpDisable, setTotpDisable, disableCurrent] = useIdentityDialog<{ userId: string; authorizationPassword: string; authorizationPin: string; authorizationTotp: string; error: string } | null>(null, current, policy, subjectExists);
  const [totpStart, setTotpStart, startCurrent] = useIdentityDialog<{ userId: string; authorizationPassword: string; authorizationPin: string; authorizationTotp: string; error: string } | null>(null, current, policy, subjectExists);
  const [enabledEdit, setEnabledEdit, enabledCurrent] = useIdentityDialog<{ userId: string; enabled: boolean; authorizationPassword: string; authorizationPin: string; authorizationTotp: string; error: string } | null>(null, current, policy, subjectExists);
  // Enrollment is two gated calls, so the factors the operator entered once are
  // held for the confirm call and dropped the moment the enrollment closes.
  const [totpAuthorization, setTotpAuthorization] = useIdentityDialog<Authorization | null>(null, current, policy);
  useEffect(() => { if (!totpSetup && !totpStart) { setTotpAuthorization.commit(null); setTotpCode.commit(""); } }, [totpSetup, totpStart]);
  const operation = useOperationLock();

  const refresh = useCallback(async () => {
    if (!mounted.current || !isOwnerCurrent()) return;
    readJob.current.controller?.abort();
    const controller = new AbortController(), id = ++readJob.current.id;
    readJob.current.controller = controller;
    const readCurrent = () => mounted.current && isOwnerCurrent() && !controller.signal.aborted && readJob.current.id === id;
    setReadLoading(true); setReadError("");
    try {
      const result = await api.get<IdentityAccessSnapshotResponse>("snapshot", { signal: controller.signal });
      if (!readCurrent()) return;
      if (!result.ok || !validIdentitySnapshot(result.payload)) { setReadError("Identity metadata could not be loaded."); return; }
      setSnapshot(result);
    } catch { if (readCurrent()) setReadError("Identity metadata could not be loaded."); }
    finally { if (readCurrent()) setReadLoading(false); }
  }, [api, isOwnerCurrent]);
  const latestRefresh = useRef(refresh); latestRefresh.current = refresh;
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; ++readJob.current.id; readJob.current.controller?.abort(); }; }, []);
  useEffect(() => { void refresh(); return () => { ++readJob.current.id; readJob.current.controller?.abort(); }; }, [refresh]);
  const renderToken = {}, latestRender = useRef(renderToken); latestRender.current = renderToken;
  const guard = <T extends (...args: any[]) => any>(handler: T): T => ((...args: Parameters<T>) => { if (current() && latestRender.current === renderToken) return handler(...args); }) as T;
  const safePost = async <T,>(endpoint: string, payload: JsonObject): Promise<ApiResponse<T>> => {
    try {
      const result = await api.post<T>(endpoint, payload);
      return result && typeof result.ok === "boolean" && (result.error === undefined || typeof result.error === "string") ? result : { ok: false, error: "The identity operation could not be completed. Try again." };
    }
    catch { return { ok: false, error: "The identity operation could not be completed. Try again." }; }
  };
  const filteredUsers = useMemo(() => visibleIdentityUsers(users, query, enabledFilter), [enabledFilter, query, users]);
  const visibleUserId = reconcileVisibleSelection(filteredUsers, selectedUserId, (user) => user.id);
  const selectedUser = filteredUsers.find((user) => user.id === visibleUserId);
  useEffect(() => {
    const nextId = selectedUser?.id ?? "";
    if (selectedUserId !== nextId) setSelectedUserId(nextId);
  }, [selectedUser?.id, selectedUserId]);

  async function createUser() {
    if (!current() || latestRender.current !== renderToken || !createOpen || !authorizationComplete(newUser, currentUser, actorPinConfigured)) return;
    const allowed = createCurrent(), draftCurrent = newUserCurrent();
    await operation.run("create-user", async () => {
      const result = await safePost("create-user", newUser);
      if (!allowed() || !draftCurrent()) return;
      if (!result.ok) { setStatus(refusalMessage(result, "Create failed.")); return; }
      setStatus("User created"); setNewUser.commit(emptyNewUser()); setCreateOpen.commit(false); await refresh();
    });
  }
  async function updateUser(user: User, patch: JsonObject, allowed: () => boolean) {
    return operation.run("update-user", async () => {
      if (!allowed() || !usersRef.current.some((item) => item.id === user.id)) return false;
      const result = await safePost("update-user", { id: user.id, ...patch });
      if (!allowed()) return false;
      setStatus(result.ok ? "User updated" : refusalMessage(result, "Update failed."));
      if (result.ok) await refresh();
      return result.ok;
    });
  }
  async function saveProfile() {
    if (!current() || latestRender.current !== renderToken || !profileEdit) return;
    const allowed = profileCurrent(), user = users.find((item) => item.id === profileEdit.id);
    if (user && await updateUser(user, { username: profileEdit.username, displayName: profileEdit.displayName }, allowed) && allowed()) setProfileEdit.commit(null);
  }
  async function saveRoleEdit() {
    if (!current() || latestRender.current !== renderToken || !roleEdit) return;
    const user = users.find((item) => item.id === roleEdit.userId);
    if (!user || isLastEnabledAdmin(users, user) || !authorizationComplete({ authorizationPassword: roleEdit.password, authorizationPin: roleEdit.pin, authorizationTotp: roleEdit.totp }, currentUser, actorPinConfigured)) return;
    const allowed = roleCurrent();
    await operation.run("update-role", async () => {
      const result = await safePost("update-user", { id: roleEdit.userId, roleId: roleEdit.roleId, authorizationPassword: roleEdit.password, authorizationPin: roleEdit.pin, authorizationTotp: roleEdit.totp });
      if (!allowed()) return;
      if (result.ok) { setStatus("Role updated"); setRoleAlert(null); setRoleEdit.commit(null); await refresh(); }
      else setRoleAlert({ tone: "error", message: refusalMessage(result, "Role update failed.") });
    });
  }
  async function saveEnabledEdit() {
    if (!current() || latestRender.current !== renderToken || !enabledEdit || !authorizationComplete(enabledEdit, currentUser, actorPinConfigured)) return;
    const draft = enabledEdit, user = users.find((item) => item.id === draft.userId), allowed = enabledCurrent();
    if (!user || (!draft.enabled && isLastEnabledAdmin(users, user))) return;
    await operation.run("update-user", async () => {
      const result = await safePost("update-user", { id: draft.userId, enabled: draft.enabled, ...authorizationOf(draft) });
      if (!allowed()) return;
      if (!result.ok) { setEnabledEdit.commit({ ...draft, error: refusalMessage(result, "Update failed.") }); return; }
      setStatus(draft.enabled ? "User enabled" : "User disabled"); setEnabledEdit.commit(null); await refresh();
    });
  }
  async function saveCredential() {
    if (!current() || latestRender.current !== renderToken || !credentialEdit || !users.some((user) => user.id === credentialEdit.userId)) return;
    if (!credentialEdit.value || credentialEdit.value !== credentialEdit.confirm || !authorizationComplete(credentialEdit, currentUser, actorPinConfigured)) { setCredentialAlert({ tone: "error", message: "Complete matching values and current security factors." }); return; }
    const draft = credentialEdit, allowed = credentialCurrent();
    await operation.run("update-credential", async () => {
      const result = await safePost(draft.kind === "password" ? "set-password" : "set-pin", { userId: draft.userId, value: draft.value, ...authorizationOf(draft) });
      if (!allowed()) return;
      if (result.ok) { setStatus(draft.kind + " updated"); setCredentialAlert(null); setCredentialEdit.commit(null); await refresh(); }
      else setCredentialAlert({ tone: "error", message: refusalMessage(result, "Credential update failed.") });
    });
  }
  async function beginTotp() {
    if (!current() || latestRender.current !== renderToken || !totpStart || !authorizationComplete(totpStart, currentUser, actorPinConfigured)) return;
    const draft = totpStart, allowed = startCurrent();
    await operation.run("begin-totp", async () => {
      const result = await safePost<{ secret: string; otpauthUrl: string; qrSvg: string; issuer: string; accountLabel: string }>("begin-totp", draft);
      if (!allowed()) return;
      if (!result.ok || !validTotpSetup(result.payload)) { setTotpStart.commit({ ...draft, error: refusalMessage(result, "2FA setup could not be loaded.") }); return; }
      setTotpAuthorization.commit(authorizationOf(draft)); setTotpSetup.commit({ ...result.payload, userId: draft.userId });
      setTotpCode.commit(""); setTotpStart.commit(null); setStatus("2FA setup started");
    });
  }
  function closeTotpSetup() {
    setTotpSetup(null); setTotpCode(""); setTotpAuthorization(null);
  }
  async function confirmTotp() {
    if (!current() || latestRender.current !== renderToken || !totpSetup || totpCode.length !== 6 || !totpAuthorization || !authorizationComplete(totpAuthorization, currentUser, actorPinConfigured)) return;
    const setup = totpSetup, allowed = setupCurrent();
    await operation.run("confirm-totp", async () => {
      const result = await safePost("confirm-totp", { userId: setup.userId, code: totpCode, ...totpAuthorization });
      if (!allowed()) return;
      setStatus(result.ok ? "2FA enabled" : refusalMessage(result, "2FA confirmation failed."));
      if (result.ok) { setTotpSetup.commit(null); setTotpCode.commit(""); setTotpAuthorization.commit(null); await refresh(); }
    });
  }
  async function disableTotp() {
    if (!current() || latestRender.current !== renderToken || !totpDisable || !authorizationComplete(totpDisable, currentUser, actorPinConfigured)) return;
    const draft = totpDisable, allowed = disableCurrent();
    await operation.run("disable-totp", async () => {
      const result = await safePost("disable-totp", draft);
      if (!allowed()) return;
      if (!result.ok) { setTotpDisable.commit({ ...draft, error: refusalMessage(result, "2FA disable failed.") }); return; }
      setStatus("2FA disabled"); setTotpDisable.commit(null); await refresh();
    });
  }
  function beginCredential(user: User, kind: "password" | "pin") {
    if (!current() || latestRender.current !== renderToken || !usersRef.current.some((item) => item.id === user.id)) return;
    setSelectedUserId(user.id); setCredentialAlert(null); setCredentialEdit({ userId: user.id, ...emptyCredentialEdit(kind) });
  }

  if (!snapshot && readLoading) return <LoadingState label="Loading identity and access" detail="Retrieving users, roles, sessions, and authentication policy." />;
  if (!snapshot) return <EmptyState title="Identity and access unavailable" description={readError || "No identity snapshot confirmed."} action={<button className="button" onClick={guard(() => void latestRefresh.current())} type="button">Retry</button>} />;

  return (
    <OperationBusyBoundary busy={operation.busy}><section aria-busy={operation.busy || undefined} className="identity-access-workspace">
      <header className="program-inner-header">
        <div><strong>Identity and Access</strong><span>Manage accounts, roles, credentials, and authentication policy.</span></div>
        <StatusText value={operation.activeOperation ? `Identity operation in progress: ${operation.activeOperation}` : status} />
        {status ? <p role="status">{status}</p> : null}
      </header>
      {readError ? <><VisualAlert tone="error" title="Identity metadata stale" message={readError} /><p role="status">Showing the last confirmed identity metadata.</p><button className="button" onClick={guard(() => void latestRefresh.current())} type="button">Retry</button></> : null}
      <button className="button" disabled={readLoading} onClick={guard(() => void latestRefresh.current())} type="button">Refresh</button>
      <Segmented label="Identity and Access view" options={["Users", "Roles", "Authentication Policy"]} value={activeView} onChange={guard((value) => setActiveView(value as IdentityView))} />

      {activeView === "Users" ? <div className="identity-users-layout">
        <Panel title="Users" action={<button className="button button-primary" disabled={operation.busy} onClick={guard(() => setCreateOpen(true))} type="button"><UserPlus size={14} aria-hidden />Add User</button>}>
          <div className="program-list-toolbar">
            <label className="program-search-field"><Search size={14} aria-hidden /><input aria-label="Search users" onChange={guard((event) => setQuery(event.target.value))} placeholder="Search name, username, or role" type="search" value={query} /></label>
            <select aria-label="Filter users" onChange={guard((event) => setEnabledFilter(event.target.value as typeof enabledFilter))} value={enabledFilter}><option value="all">All users</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select>
          </div>
          <DataTable label="Identity users" columns={["User", "Role", "2FA", "Status", "Actions"]} rows={filteredUsers.map((user) => {
            const protectedAdmin = isLastEnabledAdmin(users, user);
            return [
              <button aria-current={selectedUser?.id === user.id ? "true" : undefined} className="identity-user-link" onClick={guard(() => setSelectedUserId(user.id))} type="button"><strong>{user.displayName}</strong><small>@{user.username}</small></button>,
              user.roleId,
              <StatusBadge value={user.totpEnabled ? "Enabled" : "Off"} />,
              <StatusBadge value={user.enabled ? "Enabled" : "Disabled"} />,
              <Menu icon={<MoreHorizontal size={15} aria-hidden />} iconOnly label={"Actions for " + user.displayName} options={[
                { id: "profile", label: "Edit profile", onSelect: guard(() => { setSelectedUserId(user.id); setProfileEdit({ id: user.id, username: user.username, displayName: user.displayName }); }) },
                { id: "role", label: "Change role", disabled: protectedAdmin, onSelect: guard(() => { setSelectedUserId(user.id); setRoleAlert(null); setRoleEdit({ userId: user.id, roleId: user.roleId, password: "", pin: "", totp: "" }); }) },
                { id: "password", label: "Change password", onSelect: guard(() => beginCredential(user, "password")) },
                { id: "pin", label: "Change PIN", onSelect: guard(() => beginCredential(user, "pin")) },
                { id: "totp", label: user.totpEnabled ? "Disable 2FA" : "Set up 2FA", onSelect: guard(() => { setSelectedUserId(user.id); setTotpDisable(null); setTotpStart(null); if (user.totpEnabled) setTotpDisable(emptyAuthorizationStep(user.id)); else setTotpStart(emptyAuthorizationStep(user.id)); }) },
                { id: "enabled", label: user.enabled ? "Disable user" : "Enable user", danger: user.enabled, disabled: protectedAdmin, onSelect: guard(() => { setSelectedUserId(user.id); setEnabledEdit({ userId: user.id, enabled: !user.enabled, ...NO_AUTHORIZATION, error: "" }); }) }
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

      {createOpen ? <Modal title="Add User" description="Create a framework account with an initial role and temporary credentials." onClose={guard(() => { setCreateOpen(false); setNewUser(emptyNewUser()); })}>
        <div className="dialog-form"><Field label="Username" required><input autoComplete="username" data-autofocus value={newUser.username} onChange={guard((event) => setNewUser({ ...newUser, username: event.target.value }))} /></Field><Field label="Display name" required><input value={newUser.displayName} onChange={guard((event) => setNewUser({ ...newUser, displayName: event.target.value }))} /></Field><Field label="Role" required><select value={newUser.roleId} onChange={guard((event) => setNewUser({ ...newUser, roleId: event.target.value }))}>{roles.map((role) => <option key={role.id} value={role.id}>{role.id}</option>)}</select></Field><Field label="Temporary password" required><input autoComplete="new-password" type="password" value={newUser.password} onChange={guard((event) => setNewUser({ ...newUser, password: event.target.value }))} /></Field><Field hint="Leave blank when this account does not require a PIN." label="PIN"><input inputMode="numeric" value={newUser.pin} onChange={guard((event) => setNewUser({ ...newUser, pin: digits(event.target.value) }))} /></Field><label className="check-row"><input checked={newUser.enabled} onChange={guard((event) => setNewUser({ ...newUser, enabled: event.target.checked }))} type="checkbox" />Enabled at creation</label><AuthorizationFields currentUser={currentUser} pinConfigured={actorPinConfigured} value={newUser} onChange={guard((authorization) => setNewUser({ ...newUser, ...authorization }))} /></div>
        <div className="modal-actions"><button className="button" onClick={guard(() => { setCreateOpen(false); setNewUser(emptyNewUser()); })} type="button">Cancel</button><button className="button button-primary" disabled={!newUser.username.trim() || !newUser.displayName.trim() || !newUser.password || (newUser.pin.length > 0 && newUser.pin.length < 4) || !authorizationComplete(newUser, currentUser, actorPinConfigured)} onClick={guard(() => void createUser())} type="button">Create User</button></div>
      </Modal> : null}

      {profileEdit ? <Modal title="Edit User Profile" onClose={guard(() => setProfileEdit(null))}><div className="dialog-form"><Field label="Display name" required><input data-autofocus value={profileEdit.displayName} onChange={guard((event) => setProfileEdit({ ...profileEdit, displayName: event.target.value }))} /></Field><Field label="Username" required><input value={profileEdit.username} onChange={guard((event) => setProfileEdit({ ...profileEdit, username: event.target.value }))} /></Field></div><div className="modal-actions"><button className="button" onClick={guard(() => setProfileEdit(null))} type="button">Cancel</button><button className="button button-primary" disabled={!profileEdit.displayName.trim() || !profileEdit.username.trim()} onClick={guard(() => void saveProfile())} type="button">Save Profile</button></div></Modal> : null}

      {totpSetup ? <Modal title="Set Up Two-Factor Authentication" description={"Enroll an authenticator for " + (users.find((user) => user.id === totpSetup.userId)?.displayName ?? "this user") + "."} onClose={guard(closeTotpSetup)}><div className="totp-enrollment"><div className="totp-qr-card"><div className="totp-qr-frame" dangerouslySetInnerHTML={{ __html: String(totpSetup.qrSvg ?? "") }} /><span>Scan with an authenticator app</span></div><div className="totp-enrollment-steps"><VisualAlert tone="info" title="Authenticator setup" message="Scan the QR code or enter the manual key, then provide the current six-digit code." /><div className="secret-copy-row"><span><strong>Manual key</strong><code>{totpSetup.secret}</code></span><ClipboardButton key={totpSetup.userId} value={String(totpSetup.secret ?? "")} /></div><details className="otpauth-details"><summary>Advanced URI</summary><code>{totpSetup.otpauthUrl}</code></details><Field label="Six-digit code" required><input data-autofocus inputMode="numeric" value={totpCode} onChange={guard((event) => setTotpCode(digits(event.target.value).slice(0, 6)))} /></Field></div></div><div className="modal-actions"><button className="button" onClick={guard(closeTotpSetup)} type="button">Cancel</button><button className="button button-primary" disabled={totpCode.length !== 6} onClick={guard(() => void confirmTotp())} type="button"><QrCode size={14} aria-hidden />Enable 2FA</button></div></Modal> : null}

      {totpStart ? <Modal title="Set Up Two-Factor Authentication" description={"Authorize enrollment for " + (users.find((user) => user.id === totpStart.userId)?.displayName ?? "this user") + "."} onClose={guard(() => setTotpStart(null))}>{totpStart.error ? <VisualAlert tone="error" title="Authorization failed" message={totpStart.error} /> : null}<div className="dialog-form"><VisualAlert tone="warning" title="Security impact" message="Enrollment issues the authenticator secret for this account, replacing any authenticator already set up for it." /><AuthorizationFields currentUser={currentUser} pinConfigured={actorPinConfigured} value={totpStart} onChange={guard((authorization) => setTotpStart({ ...totpStart, ...authorization, error: "" }))} /></div><div className="modal-actions"><button className="button" onClick={guard(() => setTotpStart(null))} type="button">Cancel</button><button className="button button-primary" disabled={!authorizationComplete(totpStart, currentUser, actorPinConfigured)} onClick={guard(() => void beginTotp())} type="button"><QrCode size={14} aria-hidden />Continue</button></div></Modal> : null}

      {credentialEdit ? <Modal title={"Change " + credentialEdit.kind} description={"Replace " + (users.find((user) => user.id === credentialEdit.userId)?.displayName ?? "this user") + "'s " + credentialEdit.kind + " after authorizing this privileged action."} onClose={guard(() => setCredentialEdit(null))}>{credentialAlert ? <VisualAlert tone={credentialAlert.tone} title="Credential update" message={credentialAlert.message} /> : null}<div className="dialog-form"><Field label="New value" required><input autoComplete="new-password" data-autofocus inputMode={credentialEdit.kind === "pin" ? "numeric" : undefined} type={credentialEdit.kind === "password" ? "password" : "text"} value={credentialEdit.value} onChange={guard((event) => setCredentialEdit({ ...credentialEdit, value: credentialEdit.kind === "pin" ? digits(event.target.value) : event.target.value }))} /></Field><Field label="Confirm value" required><input autoComplete="new-password" inputMode={credentialEdit.kind === "pin" ? "numeric" : undefined} type={credentialEdit.kind === "password" ? "password" : "text"} value={credentialEdit.confirm} onChange={guard((event) => setCredentialEdit({ ...credentialEdit, confirm: credentialEdit.kind === "pin" ? digits(event.target.value) : event.target.value }))} /></Field><AuthorizationFields currentUser={currentUser} pinConfigured={actorPinConfigured} value={credentialEdit} onChange={guard((authorization) => setCredentialEdit({ ...credentialEdit, ...authorization }))} /></div><div className="modal-actions"><button className="button" onClick={guard(() => setCredentialEdit(null))} type="button">Cancel</button><button className="button button-primary" disabled={!credentialEdit.value || credentialEdit.value !== credentialEdit.confirm || !credentialEdit.authorizationPassword || (actorPinConfigured && credentialEdit.authorizationPin.length < 4) || (currentUser.totpEnabled && credentialEdit.authorizationTotp.length !== 6)} onClick={guard(() => void saveCredential())} type="button"><KeyRound size={14} aria-hidden />Save Credential</button></div></Modal> : null}

      {totpDisable ? <Modal title="Disable Two-Factor Authentication" description={"Remove authenticator protection from " + (users.find((user) => user.id === totpDisable.userId)?.displayName ?? "this user") + "."} onClose={guard(() => setTotpDisable(null))}>{totpDisable.error ? <VisualAlert tone="error" title="Authorization failed" message={totpDisable.error} /> : null}<div className="dialog-form"><VisualAlert tone="warning" title="Security impact" message="This user will be able to sign in without an authenticator code after this change." /><AuthorizationFields currentUser={currentUser} pinConfigured={actorPinConfigured} value={totpDisable} onChange={guard((authorization) => setTotpDisable({ ...totpDisable, ...authorization, error: "" }))} /></div><div className="modal-actions"><button className="button" onClick={guard(() => setTotpDisable(null))} type="button">Cancel</button><button className="button button-danger" disabled={!totpDisable.authorizationPassword || (actorPinConfigured && totpDisable.authorizationPin.length < 4) || (currentUser.totpEnabled && totpDisable.authorizationTotp.length !== 6)} onClick={guard(() => void disableTotp())} type="button">Disable 2FA</button></div></Modal> : null}

      {enabledEdit ? <Modal title={enabledEdit.enabled ? "Enable User" : "Disable User"} description={(enabledEdit.enabled ? "Restore access for " : "Withdraw access from ") + (users.find((user) => user.id === enabledEdit.userId)?.displayName ?? "this user") + "."} onClose={guard(() => setEnabledEdit(null))}>{enabledEdit.error ? <VisualAlert tone="error" title="Authorization failed" message={enabledEdit.error} /> : null}<div className="dialog-form"><VisualAlert tone="warning" title="Security impact" message={enabledEdit.enabled ? "This account will be able to sign in again with its existing role and credentials." : "This account will no longer be able to sign in, and anyone relying on it loses access."} /><AuthorizationFields currentUser={currentUser} pinConfigured={actorPinConfigured} value={enabledEdit} onChange={guard((authorization) => setEnabledEdit({ ...enabledEdit, ...authorization, error: "" }))} /></div><div className="modal-actions"><button className="button" onClick={guard(() => setEnabledEdit(null))} type="button">Cancel</button><button className={enabledEdit.enabled ? "button button-primary" : "button button-danger"} disabled={!authorizationComplete(enabledEdit, currentUser, actorPinConfigured)} onClick={guard(() => void saveEnabledEdit())} type="button">{enabledEdit.enabled ? "Enable User" : "Disable User"}</button></div></Modal> : null}

      {roleEdit ? <Modal title="Change Role" description="Changing permissions affects what this user can view and control." onClose={guard(() => setRoleEdit(null))}>{roleAlert ? <VisualAlert tone={roleAlert.tone} title="Role update" message={roleAlert.message} /> : null}<div className="dialog-form"><Field label="Role" required><select data-autofocus value={roleEdit.roleId} onChange={guard((event) => setRoleEdit({ ...roleEdit, roleId: event.target.value }))}>{roles.map((role) => <option key={role.id} value={role.id}>{role.id}</option>)}</select></Field><AuthorizationFields currentUser={currentUser} pinConfigured={actorPinConfigured} value={{ authorizationPassword: roleEdit.password, authorizationPin: roleEdit.pin, authorizationTotp: roleEdit.totp }} onChange={guard((value) => setRoleEdit({ ...roleEdit, password: value.authorizationPassword, pin: value.authorizationPin, totp: value.authorizationTotp }))} /></div><div className="modal-actions"><button className="button" onClick={guard(() => setRoleEdit(null))} type="button">Cancel</button><button className="button button-primary" disabled={!roleEdit.password || (actorPinConfigured && roleEdit.pin.length < 4) || (currentUser.totpEnabled && roleEdit.totp.length !== 6)} onClick={guard(() => void saveRoleEdit())} type="button">Save Role</button></div></Modal> : null}
    </section></OperationBusyBoundary>
  );
}

/** Dialog state owns its policy, subject availability and retained callbacks. */
function useIdentityDialog<T>(initial: T, current: () => boolean, policy: string, available: (value: T) => boolean = () => true) {
  const [state, setState] = useState({ policy, value: initial });
  const eligible = state.policy === policy && available(state.value);
  const record = useRef({ state, policy, eligible, revision: 0 });
  if (record.current.state !== state || record.current.policy !== policy || record.current.eligible !== eligible) record.current = { state, policy, eligible, revision: record.current.revision + 1 };
  const token = {}, latestRender = useRef(token); latestRender.current = token;
  const commit = (next: SetStateAction<T>) => {
    if (!current()) return;
    const prior = record.current.eligible ? record.current.state.value : initial;
    const value = typeof next === "function" ? (next as (value: T) => T)(prior) : next;
    const replacement = { policy, value };
    record.current = { state: replacement, policy, eligible: available(value), revision: record.current.revision + 1 };
    setState(replacement);
  };
  const setter = Object.assign((next: SetStateAction<T>) => { if (latestRender.current === token) commit(next); }, { commit });
  const capture = () => { const revision = record.current.revision; return () => current() && record.current.eligible && record.current.revision === revision; };
  useEffect(() => { if (!eligible) commit(initial); }, [eligible]);
  return [eligible ? state.value : initial, setter, capture] as const;
}

const identityObject = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value);
function validIdentitySnapshot(value: unknown): value is IdentityAccessSnapshotResponse {
  if (!identityObject(value) || !Array.isArray(value.users) || !Array.isArray(value.roles) || !Array.isArray(value.sessions) || !identityObject(value.vault)) return false;
  return value.users.every((user) => identityObject(user) && [user.id, user.username, user.displayName, user.roleId].every((entry) => typeof entry === "string") && typeof user.enabled === "boolean" && typeof user.totpEnabled === "boolean" && [user.passwordConfigured, user.pinConfigured].every((entry) => entry === undefined || typeof entry === "boolean") && finite(user.createdAtMs) && finite(user.updatedAtMs))
    && value.roles.every((role) => identityObject(role) && typeof role.id === "string" && Array.isArray(role.permissions) && role.permissions.every((permission) => typeof permission === "string"))
    && value.sessions.every((session) => identityObject(session) && typeof session.id === "string" && typeof session.userId === "string" && finite(session.expiresAtMs))
    && typeof value.vault.initialized === "boolean" && typeof value.vault.unlocked === "boolean" && (value.vault.unlockedBy === undefined || typeof value.vault.unlockedBy === "string") && [value.vault.unlockedAtMs, value.vault.encryptedFieldCount].every((entry) => entry === undefined || finite(entry));
}
function validTotpSetup(value: unknown): value is { secret: string; otpauthUrl: string; qrSvg: string; issuer: string; accountLabel: string } {
  return identityObject(value) && [value.secret, value.otpauthUrl, value.qrSvg, value.issuer, value.accountLabel].every((entry) => typeof entry === "string");
}

type Authorization = { authorizationPassword: string; authorizationPin: string; authorizationTotp: string };

const NO_AUTHORIZATION: Authorization = { authorizationPassword: "", authorizationPin: "", authorizationTotp: "" };

function emptyNewUser() {
  return { username: "", displayName: "", roleId: "viewer", password: "", pin: "", enabled: true, ...NO_AUTHORIZATION };
}

function emptyAuthorizationStep(userId: string) {
  return { userId, ...NO_AUTHORIZATION, error: "" };
}

function authorizationOf(value: Authorization): Authorization {
  return { authorizationPassword: value.authorizationPassword, authorizationPin: value.authorizationPin, authorizationTotp: value.authorizationTotp };
}

/**
 * The message to show for a refused privileged call. A gated Identity Access
 * endpoint answers `requiresRecheck` when what is missing is proof of the
 * acting user's own credentials rather than permission, and the two need
 * different words: one is a form to fill in again, the other a dead end. The
 * field rides through `normalizeProgramApiResponse` untyped, so it is read
 * here rather than named in the shared response type.
 */
function refusalMessage(result: { error?: string }, fallback: string): string {
  const message = result.error ?? fallback;
  return (result as { requiresRecheck?: boolean }).requiresRecheck === true
    ? message + " Enter your current security factors and try again."
    : message;
}

/** The factors the acting user must supply before a gated endpoint will act: password always, PIN when configured, 2FA code when enabled. */
function authorizationComplete(value: Authorization, currentUser: CurrentUser, pinConfigured: boolean): boolean {
  if (!value.authorizationPassword) return false;
  if (pinConfigured && value.authorizationPin.length < 4) return false;
  return !currentUser.totpEnabled || value.authorizationTotp.length === 6;
}

function AuthorizationFields(props: { currentUser: CurrentUser; pinConfigured: boolean; value: { authorizationPassword: string; authorizationPin: string; authorizationTotp: string }; onChange(value: { authorizationPassword: string; authorizationPin: string; authorizationTotp: string }): void }) {
  return <><VisualAlert tone="warning" title="Authorization required" message="Use the acting user's current security factors to approve this change." /><Field label="Your current password" required><input autoComplete="current-password" type="password" value={props.value.authorizationPassword} onChange={(event) => props.onChange({ ...props.value, authorizationPassword: event.target.value })} /></Field>{props.pinConfigured ? <Field label="Your current PIN" required><input inputMode="numeric" value={props.value.authorizationPin} onChange={(event) => props.onChange({ ...props.value, authorizationPin: digits(event.target.value) })} /></Field> : null}{props.currentUser.totpEnabled ? <Field label="Your 2FA code" required><input autoComplete="one-time-code" inputMode="numeric" value={props.value.authorizationTotp} onChange={(event) => props.onChange({ ...props.value, authorizationTotp: digits(event.target.value).slice(0, 6) })} /></Field> : null}</>;
}
