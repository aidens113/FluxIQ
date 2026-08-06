"use client";

import { BookOpen, CalendarClock, CheckCircle2, ChevronDown, ChevronRight, CloudUpload, Copy, Database, FileText, FolderOpen, GitBranch, KeyRound, Play, PlayCircle, QrCode, RefreshCcw, ShieldCheck, Square, TimerReset, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import type { IdentityAccessSnapshotResponse, User } from "fluxiq/identity-access";
import { useProgramApi, type ApiResponse, type JsonObject } from "../program-api";
import { DataTable, Field, KeyValue, Modal, Panel, Segmented, SpecDatum, StatusBadge, StatusText, SummaryStrip, VisualAlert, type AlertTone } from "../shared-ui";
import type { CurrentUser } from "../types";

import { buildDocumentationTree, copyText, csv, digits, docRouteKey, docsLinkCandidates, emptyCredentialEdit, flattenRunLogs, formatCountdown, formatDbCell, formatDuration, formatTime, isSensitiveDatabaseStore, normalizeDocPath, parseJsonObject, resolveDocsLink, sandboxedDocumentationHtml, scheduleProgress, sensitiveStoreKey, shortJson, shouldCollapseDocsFolder, titleFromRouteSegment, yesNo, type DocsTreeNode } from "./shared";
export function IdentityAccessLive({ currentUser }: { currentUser: CurrentUser }) {
  const api = useProgramApi("identity-access");
  const [snapshot, setSnapshot] = useState<ApiResponse<IdentityAccessSnapshotResponse> | null>(null);
  const [status, setStatus] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [newUser, setNewUser] = useState({ username: "", displayName: "", roleId: "viewer", password: "", pin: "", enabled: true });
  const [totpCode, setTotpCode] = useState("");
  const [totpSetup, setTotpSetup] = useState<{ secret: string; otpauthUrl: string; qrSvg: string; issuer: string; accountLabel: string } | null>(null);
  const [credentialEdit, setCredentialEdit] = useState<{ kind: "password" | "pin"; value: string; confirm: string; authorizationPassword: string; authorizationPin: string; authorizationTotp: string } | null>(null);
  const [credentialAlert, setCredentialAlert] = useState<{ tone: AlertTone; message: string } | null>(null);
  const [roleEdit, setRoleEdit] = useState<{ userId: string; roleId: string; password: string; pin: string; totp: string } | null>(null);
  const [roleAlert, setRoleAlert] = useState<{ tone: AlertTone; message: string } | null>(null);

  const refresh = useCallback(async () => setSnapshot(await api.get<IdentityAccessSnapshotResponse>("snapshot")), [api]);
  useEffect(() => void refresh(), [refresh]);
  const users = snapshot?.payload?.users ?? [];
  const roles = snapshot?.payload?.roles ?? [];
  const selectedUser = users.find((user) => user.id === selectedUserId) ?? users[0];
  const actorUser = users.find((user) => user.id === currentUser.id);
  const actorPinConfigured = Boolean(actorUser?.pinConfigured);

  async function createUser() {
    const result = await api.post("create-user", newUser);
    setStatus(result.ok ? "User created" : result.error ?? "Create failed");
    setNewUser({ username: "", displayName: "", roleId: "viewer", password: "", pin: "", enabled: true });
    await refresh();
  }

  async function updateUser(user: User, patch: JsonObject) {
    const result = await api.post("update-user", { id: user.id, ...patch });
    setStatus(result.ok ? "User updated" : result.error ?? "Update failed");
    await refresh();
  }

  async function saveRoleEdit() {
    if (!roleEdit) return;
    const result = await api.post("update-user", {
      id: roleEdit.userId,
      roleId: roleEdit.roleId,
      authorizationPassword: roleEdit.password,
      authorizationPin: roleEdit.pin,
      authorizationTotp: roleEdit.totp
    });
    if (result.ok) {
      setStatus("Role updated");
      setRoleAlert(null);
      setRoleEdit(null);
    } else {
      setRoleAlert({ tone: "error", message: result.error ?? "Role update failed." });
    }
    await refresh();
  }

  async function saveCredential() {
    if (!selectedUser || !credentialEdit || credentialEdit.value !== credentialEdit.confirm) {
      setCredentialAlert({ tone: "error", message: "Credential values must match." });
      return;
    }
    const endpoint = credentialEdit.kind === "password" ? "set-password" : "set-pin";
    const result = await api.post(endpoint, {
      userId: selectedUser.id,
      value: credentialEdit.value,
      authorizationPassword: credentialEdit.authorizationPassword,
      authorizationPin: credentialEdit.authorizationPin,
      authorizationTotp: credentialEdit.authorizationTotp
    });
    if (result.ok) {
      setStatus(`${credentialEdit.kind} updated`);
      setCredentialAlert(null);
      setCredentialEdit(null);
      return;
    }
    setCredentialAlert({ tone: "error", message: result.error ?? "Credential update failed." });
  }

  async function beginTotp(userId = selectedUser?.id) {
    if (!userId) return;
    const result = await api.post<{ secret: string; otpauthUrl: string; qrSvg: string; issuer: string; accountLabel: string }>("begin-totp", { userId });
    if (result.ok) {
      setTotpSetup(result.payload ?? null);
      setTotpCode("");
      setStatus("TOTP setup started");
      return;
    }
    setStatus(result.error ?? "TOTP setup failed");
  }

  async function confirmTotp() {
    if (!selectedUser) return;
    const result = await api.post("confirm-totp", { userId: selectedUser.id, code: totpCode });
    setStatus(result.ok ? "TOTP enabled" : result.error ?? "TOTP confirmation failed");
    if (result.ok) setTotpSetup(null);
    await refresh();
  }

  return (
    <section className="program-workspace-grid">
      <Panel title="Authentication">
        <KeyValue rows={[["Required", "Yes"], ["First setup user", "admin"], ["First setup password", "admin"], ["PIN", "Created after login"], ["2FA", "Per-user TOTP setup"]]} />
        <p className="muted-text">FluxIQ authentication is global. The first-run admin account is created automatically and can be rotated here.</p>
      </Panel>
      <Panel title="Create User" action={<button className="button button-primary" disabled={!newUser.username || !newUser.displayName || !newUser.password || (newUser.pin.length > 0 && newUser.pin.length < 4)} onClick={createUser} type="button">Create</button>}>
        <div className="field-row dense-fields">
          <Field label="Username"><input value={newUser.username} onChange={(event) => setNewUser({ ...newUser, username: event.target.value })} /></Field>
          <Field label="Display name"><input value={newUser.displayName} onChange={(event) => setNewUser({ ...newUser, displayName: event.target.value })} /></Field>
          <Field label="Role"><select value={newUser.roleId} onChange={(event) => setNewUser({ ...newUser, roleId: event.target.value })}>{roles.map((role) => <option key={role.id} value={role.id}>{role.id}</option>)}</select></Field>
          <Field label="Temporary password"><input type="password" value={newUser.password} onChange={(event) => setNewUser({ ...newUser, password: event.target.value })} /></Field>
          <Field label="PIN (optional)"><input value={newUser.pin} onChange={(event) => setNewUser({ ...newUser, pin: digits(event.target.value) })} /></Field>
          <label className="check-row"><input checked={newUser.enabled} onChange={(event) => setNewUser({ ...newUser, enabled: event.target.checked })} type="checkbox" />Enabled</label>
        </div>
      </Panel>

      <Panel title="Users">
        <DataTable columns={["User", "Role", "2FA", "Enabled", "Actions"]} rows={users.map((user) => [
          <button className="link-button" onClick={() => setSelectedUserId(user.id)} type="button">{user.displayName}<small>{user.username}</small></button>,
          <span className="role-cell"><strong>{user.roleId}</strong><button className="button" onClick={() => { setRoleAlert(null); setRoleEdit({ userId: user.id, roleId: user.roleId, password: "", pin: "", totp: "" }); }} type="button">Edit Role</button></span>,
          user.totpEnabled ? "Enabled" : "Off",
          <input checked={user.enabled} onChange={(event) => void updateUser(user, { enabled: event.target.checked })} type="checkbox" />,
          <div className="inline-actions"><button className="button" onClick={() => { setSelectedUserId(user.id); setCredentialAlert(null); setCredentialEdit(emptyCredentialEdit("password")); }} type="button">Password</button><button className="button" onClick={() => { setSelectedUserId(user.id); setCredentialAlert(null); setCredentialEdit(emptyCredentialEdit("pin")); }} type="button">PIN</button><button className="button" onClick={() => { setSelectedUserId(user.id); void (user.totpEnabled ? api.post("disable-totp", { userId: user.id }).then(refresh) : beginTotp(user.id)); }} type="button">{user.totpEnabled ? "Disable 2FA" : "Setup 2FA"}</button></div>
        ])} empty="No framework users have been created yet." />
      </Panel>

      <Panel title="Roles">
        <DataTable columns={["Role", "Permissions"]} rows={roles.map((role) => [role.id, role.permissions.join(", ")])} />
      </Panel>

      <Panel title="Two-Factor Setup">
        <div className="totp-setup-shell">
          <div className="totp-setup-summary">
            <span className="program-icon"><ShieldCheck size={18} aria-hidden /></span>
            <div>
              <strong>{selectedUser?.displayName ?? "No user selected"}</strong>
              <small>{selectedUser?.username ?? "Select a user from the users table"}</small>
            </div>
            <StatusBadge value={selectedUser?.totpEnabled ? "Enabled" : "Off"} />
          </div>
          {selectedUser?.totpEnabled ? <VisualAlert tone="success" title="2FA enabled" message="This user already has authenticator-based two-factor authentication enabled." /> : null}
          {!selectedUser?.totpEnabled ? <div className="inline-actions">
            <button className="button button-primary" disabled={!selectedUser} onClick={() => void beginTotp(selectedUser?.id)} type="button">
              <QrCode size={15} aria-hidden />
              Generate QR Setup
            </button>
          </div> : null}
          {totpSetup ? <div className="totp-enrollment">
            <div className="totp-qr-card">
              <div className="totp-qr-frame" dangerouslySetInnerHTML={{ __html: String(totpSetup.qrSvg ?? "") }} />
              <span>Scan with an authenticator app</span>
            </div>
            <div className="totp-enrollment-steps">
              <VisualAlert tone="info" title="Authenticator setup" message="Scan the QR code, or copy the manual key into your authenticator app. Then enter the six-digit code to enable 2FA." />
              <div className="secret-copy-row">
                <span>
                  <strong>Manual key</strong>
                  <code>{totpSetup.secret}</code>
                </span>
                <button className="button" onClick={() => copyText(String(totpSetup.secret ?? ""))} type="button">
                  <Copy size={14} aria-hidden />
                  Copy
                </button>
              </div>
              <details className="otpauth-details">
                <summary>Advanced URI</summary>
                <code>{totpSetup.otpauthUrl}</code>
              </details>
              <Field label="Six-digit code"><input inputMode="numeric" value={totpCode} onChange={(event) => setTotpCode(digits(event.target.value).slice(0, 6))} /></Field>
              <div className="modal-actions"><button className="button" onClick={() => { setTotpSetup(null); setTotpCode(""); }} type="button">Cancel Setup</button><button className="button button-primary" disabled={totpCode.length !== 6} onClick={confirmTotp} type="button">Enable 2FA</button></div>
            </div>
          </div> : null}
          {!totpSetup && !selectedUser?.totpEnabled ? <p className="muted-text">Select a user, then generate a QR setup to enroll an authenticator app.</p> : null}
        </div>
        <StatusText value={status} />
      </Panel>

      {credentialEdit ? <Modal title={`Change ${credentialEdit.kind}`} onClose={() => setCredentialEdit(null)}>
        {credentialAlert ? <VisualAlert tone={credentialAlert.tone} title="Credential update" message={credentialAlert.message} /> : null}
        <Field label="New value"><input type={credentialEdit.kind === "password" ? "password" : "text"} value={credentialEdit.value} onChange={(event) => setCredentialEdit({ ...credentialEdit, value: credentialEdit.kind === "pin" ? digits(event.target.value) : event.target.value })} /></Field>
        <Field label="Confirm value"><input type={credentialEdit.kind === "password" ? "password" : "text"} value={credentialEdit.confirm} onChange={(event) => setCredentialEdit({ ...credentialEdit, confirm: credentialEdit.kind === "pin" ? digits(event.target.value) : event.target.value })} /></Field>
        <VisualAlert tone="warning" title="Authorization required" message={`${actorPinConfigured ? "Enter your current password and PIN" : "Enter your current password"}${currentUser.totpEnabled ? ", plus your 2FA code" : ""} before changing credentials.`} />
        <Field label="Your current password"><input type="password" value={credentialEdit.authorizationPassword} onChange={(event) => setCredentialEdit({ ...credentialEdit, authorizationPassword: event.target.value })} /></Field>
        {actorPinConfigured ? <Field label="Your current PIN"><input value={credentialEdit.authorizationPin} onChange={(event) => setCredentialEdit({ ...credentialEdit, authorizationPin: digits(event.target.value) })} /></Field> : null}
        {currentUser.totpEnabled ? <Field label="Your 2FA code"><input value={credentialEdit.authorizationTotp} onChange={(event) => setCredentialEdit({ ...credentialEdit, authorizationTotp: digits(event.target.value) })} /></Field> : null}
        <div className="modal-actions"><button className="button" onClick={() => setCredentialEdit(null)} type="button">Cancel</button><button className="button button-primary" disabled={!credentialEdit.value || credentialEdit.value !== credentialEdit.confirm || !credentialEdit.authorizationPassword || (actorPinConfigured && credentialEdit.authorizationPin.length < 4) || (currentUser.totpEnabled && credentialEdit.authorizationTotp.length !== 6)} onClick={saveCredential} type="button">Save</button></div>
      </Modal> : null}

      {roleEdit ? <Modal title="Edit Role" onClose={() => setRoleEdit(null)}>
        {roleAlert ? <VisualAlert tone={roleAlert.tone} title="Role update" message={roleAlert.message} /> : null}
        <Field label="Role"><select value={roleEdit.roleId} onChange={(event) => setRoleEdit({ ...roleEdit, roleId: event.target.value })}>{roles.map((role) => <option key={role.id} value={role.id}>{role.id}</option>)}</select></Field>
        <Field label="Your password"><input type="password" value={roleEdit.password} onChange={(event) => setRoleEdit({ ...roleEdit, password: event.target.value })} /></Field>
        {actorPinConfigured ? <Field label="Your PIN"><input value={roleEdit.pin} onChange={(event) => setRoleEdit({ ...roleEdit, pin: digits(event.target.value) })} /></Field> : null}
        {currentUser.totpEnabled ? <Field label="Your 2FA code"><input value={roleEdit.totp} onChange={(event) => setRoleEdit({ ...roleEdit, totp: digits(event.target.value) })} /></Field> : null}
        <div className="modal-actions"><button className="button" onClick={() => setRoleEdit(null)} type="button">Cancel</button><button className="button button-primary" disabled={!roleEdit.password || (actorPinConfigured && roleEdit.pin.length < 4) || (currentUser.totpEnabled && roleEdit.totp.length !== 6)} onClick={saveRoleEdit} type="button">Save Role</button></div>
      </Modal> : null}
    </section>
  );
}
