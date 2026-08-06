"use client";

import { BookOpen, CalendarClock, CheckCircle2, ChevronDown, ChevronRight, CloudUpload, Copy, Database, FileText, FolderOpen, GitBranch, KeyRound, Play, PlayCircle, QrCode, RefreshCcw, ShieldCheck, Square, TimerReset, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { useProgramApi, type JsonObject } from "./program-api";
import { DataTable, Field, KeyValue, Modal, Panel, Segmented, SpecDatum, StatusBadge, StatusText, SummaryStrip, VisualAlert, type AlertTone } from "./shared-ui";
import type { CurrentUser } from "./types";

export function IdentityAccessLive({ currentUser }: { currentUser: CurrentUser }) {
  const api = useProgramApi("identity-access");
  const [snapshot, setSnapshot] = useState<any>(null);
  const [status, setStatus] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [newUser, setNewUser] = useState({ username: "", displayName: "", roleId: "viewer", password: "", pin: "", enabled: true });
  const [totpCode, setTotpCode] = useState("");
  const [totpSetup, setTotpSetup] = useState<any>(null);
  const [credentialEdit, setCredentialEdit] = useState<{ kind: "password" | "pin"; value: string; confirm: string; authorizationPassword: string; authorizationPin: string; authorizationTotp: string } | null>(null);
  const [credentialAlert, setCredentialAlert] = useState<{ tone: AlertTone; message: string } | null>(null);
  const [roleEdit, setRoleEdit] = useState<{ userId: string; roleId: string; password: string; pin: string; totp: string } | null>(null);
  const [roleAlert, setRoleAlert] = useState<{ tone: AlertTone; message: string } | null>(null);

  const refresh = useCallback(async () => setSnapshot(await api.get("snapshot")), [api]);
  useEffect(() => void refresh(), [refresh]);
  const users = snapshot?.payload?.users ?? [];
  const roles = snapshot?.payload?.roles ?? [];
  const selectedUser = users.find((user: any) => user.id === selectedUserId) ?? users[0];
  const actorUser = users.find((user: any) => user.id === currentUser.id);
  const actorPinConfigured = Boolean(actorUser?.pinConfigured);

  async function createUser() {
    const result = await api.post("create-user", newUser);
    setStatus(result.ok ? "User created" : result.error ?? "Create failed");
    setNewUser({ username: "", displayName: "", roleId: "viewer", password: "", pin: "", enabled: true });
    await refresh();
  }

  async function updateUser(user: any, patch: JsonObject) {
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
    const result = await api.post("begin-totp", { userId });
    if (result.ok) {
      setTotpSetup(result.payload);
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
          <Field label="Role"><select value={newUser.roleId} onChange={(event) => setNewUser({ ...newUser, roleId: event.target.value })}>{roles.map((role: any) => <option key={role.id} value={role.id}>{role.id}</option>)}</select></Field>
          <Field label="Temporary password"><input type="password" value={newUser.password} onChange={(event) => setNewUser({ ...newUser, password: event.target.value })} /></Field>
          <Field label="PIN (optional)"><input value={newUser.pin} onChange={(event) => setNewUser({ ...newUser, pin: digits(event.target.value) })} /></Field>
          <label className="check-row"><input checked={newUser.enabled} onChange={(event) => setNewUser({ ...newUser, enabled: event.target.checked })} type="checkbox" />Enabled</label>
        </div>
      </Panel>

      <Panel title="Users">
        <DataTable columns={["User", "Role", "2FA", "Enabled", "Actions"]} rows={users.map((user: any) => [
          <button className="link-button" onClick={() => setSelectedUserId(user.id)} type="button">{user.displayName}<small>{user.username}</small></button>,
          <span className="role-cell"><strong>{user.roleId}</strong><button className="button" onClick={() => { setRoleAlert(null); setRoleEdit({ userId: user.id, roleId: user.roleId, password: "", pin: "", totp: "" }); }} type="button">Edit Role</button></span>,
          user.totpEnabled ? "Enabled" : "Off",
          <input checked={user.enabled} onChange={(event) => void updateUser(user, { enabled: event.target.checked })} type="checkbox" />,
          <div className="inline-actions"><button className="button" onClick={() => { setSelectedUserId(user.id); setCredentialAlert(null); setCredentialEdit(emptyCredentialEdit("password")); }} type="button">Password</button><button className="button" onClick={() => { setSelectedUserId(user.id); setCredentialAlert(null); setCredentialEdit(emptyCredentialEdit("pin")); }} type="button">PIN</button><button className="button" onClick={() => { setSelectedUserId(user.id); void (user.totpEnabled ? api.post("disable-totp", { userId: user.id }).then(refresh) : beginTotp(user.id)); }} type="button">{user.totpEnabled ? "Disable 2FA" : "Setup 2FA"}</button></div>
        ])} empty="No framework users have been created yet." />
      </Panel>

      <Panel title="Roles">
        <DataTable columns={["Role", "Permissions"]} rows={roles.map((role: any) => [role.id, role.permissions.join(", ")])} />
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
        <Field label="Role"><select value={roleEdit.roleId} onChange={(event) => setRoleEdit({ ...roleEdit, roleId: event.target.value })}>{roles.map((role: any) => <option key={role.id} value={role.id}>{role.id}</option>)}</select></Field>
        <Field label="Your password"><input type="password" value={roleEdit.password} onChange={(event) => setRoleEdit({ ...roleEdit, password: event.target.value })} /></Field>
        {actorPinConfigured ? <Field label="Your PIN"><input value={roleEdit.pin} onChange={(event) => setRoleEdit({ ...roleEdit, pin: digits(event.target.value) })} /></Field> : null}
        {currentUser.totpEnabled ? <Field label="Your 2FA code"><input value={roleEdit.totp} onChange={(event) => setRoleEdit({ ...roleEdit, totp: digits(event.target.value) })} /></Field> : null}
        <div className="modal-actions"><button className="button" onClick={() => setRoleEdit(null)} type="button">Cancel</button><button className="button button-primary" disabled={!roleEdit.password || (actorPinConfigured && roleEdit.pin.length < 4) || (currentUser.totpEnabled && roleEdit.totp.length !== 6)} onClick={saveRoleEdit} type="button">Save Role</button></div>
      </Modal> : null}
    </section>
  );
}

export function DatabaseManagerLive({ currentUser }: { currentUser: CurrentUser }) {
  const api = useProgramApi("database-manager");
  const [snapshot, setSnapshot] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [kind, setKind] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [selectedDatabase, setSelectedDatabase] = useState("global");
  const [search, setSearch] = useState("");
  const [columnFilter, setColumnFilter] = useState("");
  const [status, setStatus] = useState("");
  const [credentialRecheck, setCredentialRecheck] = useState({ password: "", pin: "", totp: "" });
  const [authorizedStores, setAuthorizedStores] = useState<string[]>([]);
  const [recheckOpen, setRecheckOpen] = useState(false);

  const refresh = useCallback(async () => {
    const next = await api.get("snapshot");
    setSnapshot(next);
    const firstKind = (next.payload as any)?.stores?.[0]?.kind ?? "";
    setKind((current) => current || firstKind);
  }, [api]);
  const loadRecords = useCallback(async (storeKind = kind, authorization?: typeof credentialRecheck) => {
    if (!storeKind) return;
    const sensitive = isSensitiveDatabaseStore(storeKind);
    if (sensitive) {
      const authorized = authorizedStores.includes(sensitiveStoreKey(storeKind, selectedDatabase));
      if (!authorized) {
        setRecords([]);
        setSelectedRecord(null);
        setStatus("");
        setRecheckOpen(true);
        return;
      }
      if (!authorization) return;
    }
    const scope = selectedDatabase === "global" ? {} : { domainId: selectedDatabase };
    const result = await api.post("list-records", {
      kind: storeKind,
      scope,
      ...(sensitive && authorization ? {
        authorizationPassword: authorization.password,
        authorizationPin: authorization.pin,
        authorizationTotp: authorization.totp
      } : {})
    });
    if (!result.ok) {
      setRecords([]);
      setSelectedRecord(null);
      setStatus(result.error ?? "Unable to load records.");
      return;
    }
    setStatus("");
    setRecords((result.payload as any[]) ?? []);
  }, [api, kind, selectedDatabase, authorizedStores]);
  useEffect(() => void refresh(), [refresh]);
  useEffect(() => void loadRecords(), [loadRecords]);

  async function inspectRecord(id: string) {
    if (isSensitiveDatabaseStore(kind)) {
      setSelectedRecord(records.find((record) => record.id === id) ?? null);
      return;
    }
    const scope = selectedDatabase === "global" ? {} : { domainId: selectedDatabase };
    const result = await api.post("get-record", {
      kind,
      id,
      scope
    });
    if (!result.ok) {
      setStatus(result.error ?? "Unable to inspect record.");
      setSelectedRecord(null);
      return;
    }
    setSelectedRecord(result.payload);
  }

  async function authorizeSensitiveStore() {
    const scope = selectedDatabase === "global" ? {} : { domainId: selectedDatabase };
    const result = await api.post("list-records", {
      kind,
      scope,
      authorizationPassword: credentialRecheck.password,
      authorizationPin: credentialRecheck.pin,
      authorizationTotp: credentialRecheck.totp
    });
    if (!result.ok) {
      setStatus(result.error ?? "Recheck failed.");
      return;
    }
    setAuthorizedStores((items) => [...new Set([...items, sensitiveStoreKey(kind, selectedDatabase)])]);
    setRecheckOpen(false);
    setCredentialRecheck({ password: "", pin: "", totp: "" });
    setStatus("");
    setRecords((result.payload as any[]) ?? []);
  }

  function requestSensitiveRecheck() {
    setCredentialRecheck({ password: "", pin: "", totp: "" });
    setRecheckOpen(true);
  }

  function selectStore(database: string, storeKind: string) {
    setSelectedDatabase(database);
    setKind(storeKind);
    setSelectedRecord(null);
    setRecords([]);
    setStatus("");
    if (isSensitiveDatabaseStore(storeKind)) {
      setRecheckOpen(true);
    }
  }

  const stores = snapshot?.payload?.stores ?? [];
  const databases: string[] = snapshot?.payload?.databases?.length ? snapshot.payload.databases : ["global"];
  const columns = useMemo(() => {
    const keys = new Set<string>(["id"]);
    for (const record of records) {
      for (const key of Object.keys(record.data ?? {})) keys.add(key);
    }
    return [...keys].filter((column) => !columnFilter || column.toLowerCase().includes(columnFilter.toLowerCase()));
  }, [records, columnFilter]);
  const visibleRows = records.filter((record) => {
    const haystack = `${record.id} ${JSON.stringify(record.data ?? {})}`.toLowerCase();
    return !search || haystack.includes(search.toLowerCase());
  });
  const selectedData = selectedRecord?.data ?? null;
  const sensitiveLocked = isSensitiveDatabaseStore(kind) && !authorizedStores.includes(sensitiveStoreKey(kind, selectedDatabase));

  return (
    <section className="db-explorer-shell">
      <aside className="db-sidebar">
        <div className="db-sidebar-heading"><strong>Databases</strong><span>{databases.length}</span></div>
        <div className="db-tree">
          {databases.map((database) => (
            <div className="db-tree-group" key={database}>
              <button className={selectedDatabase === database ? "db-node selected" : "db-node"} onClick={() => setSelectedDatabase(database)} type="button"><span className="db-icon">DB</span><strong>{database === "global" ? "Global" : database}</strong></button>
              <div className="db-table-list">
                {stores.map((store: any) => (
                  <button className={kind === store.kind && selectedDatabase === database ? "db-table-node selected" : "db-table-node"} key={`${database}:${store.kind}`} onClick={() => selectStore(database, store.kind)} type="button"><span className="db-icon table">T</span>{store.kind}<small>{isSensitiveDatabaseStore(store.kind) ? "Locked" : store.recordCount}</small></button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>
      <main className="db-main">
        <div className="db-toolbar">
          <Field label="Search rows"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search IDs and values" /></Field>
          <Field label="Filter columns"><input value={columnFilter} onChange={(event) => setColumnFilter(event.target.value)} placeholder="Column name" /></Field>
          <button className="button" onClick={() => sensitiveLocked || isSensitiveDatabaseStore(kind) ? requestSensitiveRecheck() : void loadRecords()} type="button">Refresh</button>
        </div>
        {sensitiveLocked ? <section className="db-locked-state">
          <VisualAlert tone="warning" title="Credential store locked" message="This table contains identity credential records and requires a fresh security check." />
          <button className="button button-primary" onClick={requestSensitiveRecheck} type="button">Authorize View</button>
        </section> : <div className="db-grid-wrap">
          <table className="db-grid">
            <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
            <tbody>
              {visibleRows.map((record) => (
                <tr className={selectedRecord?.id === record.id ? "selected" : ""} key={record.id} onClick={() => void inspectRecord(record.id)}>
                  {columns.map((column) => <td key={column}>{column === "id" ? record.id : formatDbCell(record.data?.[column])}</td>)}
                </tr>
              ))}
              {!visibleRows.length ? <tr><td className="empty-cell" colSpan={Math.max(1, columns.length)}>No rows found.</td></tr> : null}
            </tbody>
          </table>
        </div>}
      </main>
      <aside className="db-inspector">
        <div className="db-sidebar-heading"><strong>Inspector</strong><span>{selectedRecord?.id ?? "none"}</span></div>
        {selectedRecord ? <KeyValue rows={[["ID", selectedRecord.id], ["Table", selectedRecord.kind], ["Database", selectedRecord.scope?.domainId ?? "global"], ["Created", formatTime(selectedRecord.createdAtMs)], ["Updated", formatTime(selectedRecord.updatedAtMs)]]} /> : <p className="muted-text">Select a row to inspect its keys and values.</p>}
        {selectedData ? <div className="kv-explorer">{Object.entries(selectedData).map(([key, value]) => <div key={key}><span className="db-icon key">K</span><strong>{key}</strong><code>{formatDbCell(value)}</code></div>)}</div> : null}
        <StatusText value={status} />
      </aside>
      {recheckOpen ? <Modal title="Authorize Credential Store" onClose={() => setRecheckOpen(false)}>
        <VisualAlert tone="warning" title="Fresh recheck required" message="Enter your active security factors before viewing identity credential records." />
        <Field label="Password"><input autoFocus type="password" value={credentialRecheck.password} onChange={(event) => setCredentialRecheck({ ...credentialRecheck, password: event.target.value })} /></Field>
        {currentUser.pinConfigured ? <Field label="PIN"><input value={credentialRecheck.pin} onChange={(event) => setCredentialRecheck({ ...credentialRecheck, pin: digits(event.target.value) })} /></Field> : null}
        {currentUser.totpEnabled ? <Field label="2FA code"><input value={credentialRecheck.totp} onChange={(event) => setCredentialRecheck({ ...credentialRecheck, totp: digits(event.target.value).slice(0, 6) })} /></Field> : null}
        <div className="modal-actions"><button className="button" onClick={() => setRecheckOpen(false)} type="button">Cancel</button><button className="button button-primary" disabled={!credentialRecheck.password || (currentUser.pinConfigured && credentialRecheck.pin.length < 4) || (currentUser.totpEnabled && credentialRecheck.totp.length !== 6)} onClick={() => void authorizeSensitiveStore()} type="button">Authorize View</button></div>
      </Modal> : null}
    </section>
  );
}

export function BackgroundTasksLive() {
  const api = useProgramApi("background-tasks");
  const [snapshot, setSnapshot] = useState<any>(null);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [status, setStatus] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const refresh = useCallback(async () => setSnapshot(await api.get("snapshot")), [api]);
  useEffect(() => void refresh(), [refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const tasks = snapshot?.payload?.tasks ?? [];
  const selectedTask = tasks.find((task: any) => task.id === selectedTaskId) ?? tasks[0];
  const allRuns = snapshot?.payload?.runs ?? [];
  const selectedRuns = allRuns.filter((run: any) => run.taskId === selectedTask?.id);
  const recentRuns = allRuns.slice(0, 6);
  const nextDue = tasks.filter((task: any) => task.enabled && task.nextRunAtMs).sort((left: any, right: any) => left.nextRunAtMs - right.nextRunAtMs)[0];

  async function runTask(taskId: string) {
    const result = await api.post("run", { taskId });
    setStatus(result.ok ? `Ran ${taskId}` : result.error ?? "Run failed");
    await refresh();
  }

  async function setTaskEnabled(taskId: string, enabled: boolean) {
    const result = await api.post("set-enabled", { taskId, enabled });
    setStatus(result.ok ? `${enabled ? "Started" : "Stopped"} task` : result.error ?? "Task update failed");
    await refresh();
  }

  async function setSchedulerRunning(running: boolean) {
    const result = await api.post("control", { action: running ? "start" : "stop" });
    setStatus(result.ok ? `${running ? "Resumed" : "Paused"} scheduler` : result.error ?? "Scheduler update failed");
    await refresh();
  }

  return (
    <section className="background-task-shell">
      <header className="background-task-toolbar">
        <SummaryStrip items={[["Tasks", tasks.length], ["Enabled", tasks.filter((task: any) => task.enabled).length], ["Scheduler", snapshot?.payload?.scheduler?.running ? "Running" : "Paused"], ["Next Due", nextDue ? formatCountdown(nextDue, nowMs, snapshot?.payload?.scheduler?.running) : "-"]]} />
        <div className="inline-actions"><button className="button" onClick={() => void setSchedulerRunning(!snapshot?.payload?.scheduler?.running)} type="button">{snapshot?.payload?.scheduler?.running ? "Pause Scheduler" : "Resume Scheduler"}</button><button className="button" onClick={refresh} type="button">Refresh</button></div>
      </header>
      {!snapshot?.payload?.scheduler?.running ? <VisualAlert tone="warning" title="Scheduler paused" message="Automatic due-task polling is paused. Manual task runs are still available." /> : null}
      <aside className="background-task-list">
        <div className="db-sidebar-heading"><strong>Tasks</strong><span>{tasks.length}</span></div>
        {tasks.map((task: any) => (
          <button className={selectedTask?.id === task.id ? "task-list-item selected" : "task-list-item"} key={task.id} onClick={() => setSelectedTaskId(task.id)} type="button">
            <span><strong>{task.name}</strong><small>{task.queue} / {task.schedule ?? formatDuration(task.intervalMs)}</small></span>
            <span className="task-countdown"><strong>{formatCountdown(task, nowMs, snapshot?.payload?.scheduler?.running)}</strong><small>next run</small></span>
          </button>
        ))}
        {!tasks.length ? <p className="muted-text">No background tasks registered.</p> : null}
      </aside>
      <main className="background-task-main">
        <div className="panel workspace-panel">
          <div className="panel-heading"><h2 className="panel-title">{selectedTask ? `${selectedTask.name} Runs` : "Run History"}</h2><span className="panel-count">{selectedRuns.length}</span></div>
          <DataTable columns={["Run", "Status", "Queued", "Finished", "Result"]} rows={selectedRuns.map((run: any) => [run.id.slice(0, 8), <StatusBadge key={run.id} value={run.status} />, formatTime(run.queuedAtMs), formatTime(run.finishedAtMs), <span className="run-result-cell" key={`${run.id}-result`}>{run.error ?? shortJson(run.payload)}</span>])} empty="No runs recorded for the selected task." />
          <div className="recent-run-block">
            <div className="panel-heading"><h3 className="panel-title">Recent Activity</h3><span className="panel-count">{recentRuns.length}</span></div>
            <DataTable columns={["Task", "Status", "Finished", "Result"]} rows={recentRuns.map((run: any) => [run.taskId, <StatusBadge key={run.id} value={run.status} />, formatTime(run.finishedAtMs), <span className="run-result-cell" key={`${run.id}-recent`}>{run.error ?? shortJson(run.payload)}</span>])} empty="No background task activity yet." />
          </div>
          <StatusText value={status} />
        </div>
      </main>
      <aside className="background-task-detail">
        <div className="db-sidebar-heading"><strong>Details</strong><span>{selectedTask?.id ?? "none"}</span></div>
        {selectedTask ? <>
          <div className="task-detail-title"><h2>{selectedTask.name}</h2><StatusBadge value={selectedTask.enabled ? "enabled" : "disabled"} /></div>
          <div className="task-countdown-panel"><span>Next run in</span><strong>{formatCountdown(selectedTask, nowMs, snapshot?.payload?.scheduler?.running)}</strong></div>
          <div className="task-progress-block">
            <span>Schedule progress</span>
            <div className="progress-track"><span style={{ width: scheduleProgress(selectedTask, nowMs) }} /></div>
          </div>
          <KeyValue rows={[["ID", selectedTask.id], ["Queue", selectedTask.queue], ["Schedule", selectedTask.schedule ?? formatDuration(selectedTask.intervalMs)], ["Interval", formatDuration(selectedTask.intervalMs)], ["Next run", formatTime(selectedTask.nextRunAtMs)], ["Last run", formatTime(selectedTask.lastRunAtMs)], ["Runs", String(selectedRuns.length)]]} />
          {selectedTask.metadata ? <details className="json-details" open><summary>Metadata</summary><pre>{JSON.stringify(selectedTask.metadata, null, 2)}</pre></details> : null}
          <div className="inline-actions"><button className="button button-primary" disabled={!selectedTask.enabled} onClick={() => void runTask(selectedTask.id)} type="button">Run Now</button><button className="button" onClick={() => void setTaskEnabled(selectedTask.id, !selectedTask.enabled)} type="button">{selectedTask.enabled ? "Stop Task" : "Start Task"}</button></div>
        </> : <p className="muted-text">Select a task to inspect schedule and history.</p>}
      </aside>
    </section>
  );
}

export function ComputeControlLive() {
  const api = useProgramApi("compute-control");
  const [snapshot, setSnapshot] = useState<any>(null);
  const refresh = useCallback(async () => setSnapshot(await api.get("snapshot")), [api]);
  useEffect(() => void refresh(), [refresh]);
  const nodes = snapshot?.payload?.nodes ?? [];
  const totalCapabilities = new Set(nodes.flatMap((node: any) => node.capabilities ?? [])).size;
  const totalDomains = new Set(nodes.flatMap((node: any) => node.domainIds ?? [])).size;

  return (
    <section className="program-workspace-grid">
      <Panel title="Compute Summary" action={<button className="button" onClick={refresh} type="button">Refresh</button>}>
        <SummaryStrip items={[["Connected Compute", nodes.filter((node: any) => node.status !== "offline").length], ["CPU Threads", nodes.reduce((total: number, node: any) => total + Number(node.metadata?.cpu_count ?? 0), 0)], ["Capabilities", totalCapabilities], ["Known Domains", totalDomains]]} />
      </Panel>
      <Panel title="Compute Nodes">
        <div className="compute-card-grid">
          {nodes.map((node: any) => (
            <article className="operator-card compute-card-v1" key={node.id}>
              <header>
                <div><strong>{node.label || node.id}</strong><span>{node.host || node.id}</span></div>
                <StatusBadge value={node.status} />
              </header>
              <div className="spec-grid">
                <SpecDatum label="CPU Threads" value={String(node.metadata?.cpu_count ?? "Unknown")} />
                <SpecDatum label="OS" value={String(node.metadata?.os ?? "Unknown")} />
                <SpecDatum label="Architecture" value={String(node.metadata?.architecture ?? "Unknown")} />
                <SpecDatum label="Version" value={String(node.metadata?.version ?? "Unknown")} />
                <SpecDatum label="Heartbeat" value={formatTime(node.lastHeartbeatMs)} />
                <SpecDatum label="Capabilities" value={node.capabilities.join(", ") || "None"} />
              </div>
              <div className="compute-account-strip">{node.domainIds?.length ? node.domainIds.map((domainId: string) => <span key={domainId}>{domainId}</span>) : <small>No domains assigned</small>}</div>
            </article>
          ))}
          {!nodes.length ? <p className="muted-text">No compute connected.</p> : null}
        </div>
      </Panel>
    </section>
  );
}

export function DeploymentSyncLive() {
  const api = useProgramApi("deployment-sync");
  const [snapshot, setSnapshot] = useState<any>(null);
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [selectedRun, setSelectedRun] = useState<any>(null);
  const [historyTab, setHistoryTab] = useState<"versions" | "git" | "branches" | "actions">("versions");
  const [status, setStatus] = useState("");
  const refresh = useCallback(async () => setSnapshot(await api.get("snapshot")), [api]);
  useEffect(() => void refresh(), [refresh]);
  const targets = snapshot?.payload?.targets ?? [];
  const git = snapshot?.payload?.git;
  const activeTarget = targets.find((item: any) => item.id === selectedTargetId) ?? targets[0];

  async function run(endpoint: "dry-run" | "sync" | "rollback", targetId: string, versionSha?: string) {
    const result = await api.post(endpoint, versionSha ? { targetId, versionSha } : { targetId });
    setSelectedRun(result.payload);
    setStatus(result.ok ? `${endpoint} finished` : result.error ?? "Deployment action failed");
    await refresh();
  }

  return (
    <section className="deployment-sync-shell">
      <Panel title="Repository Sync" action={<button className="button" onClick={refresh} type="button">Refresh</button>}>
        <SummaryStrip items={[["Branches", git?.branches?.length ?? targets.length], ["Current", git?.currentBranch ?? "-"], ["Working Tree", git?.dirty ? "Dirty" : "Clean"], ["Actions", snapshot?.payload?.runs?.length ?? 0]]} />
        {git?.available ? <KeyValue rows={[["Repo root", git.rootDir], ["HEAD", git.headSha ?? "-"], ["Remotes", String(git.remotes?.length ?? 0)], ["Status rows", String(git.status?.length ?? 0)]]} /> : <VisualAlert tone="error" title="Git unavailable" message={git?.error ?? "The importing project root is not a git repository."} />}
      </Panel>
      <Panel title="Branch Action">
        <div className="field-row dense-fields"><Field label="Branch target"><select value={activeTarget?.id ?? ""} onChange={(event) => setSelectedTargetId(event.target.value)}>{targets.map((item: any) => <option key={item.id} value={item.id}>{item.name}{item.metadata?.current ? " (current)" : ""}</option>)}</select></Field></div>
        {activeTarget ? <KeyValue rows={[["Branch", String(activeTarget.metadata?.branch ?? activeTarget.name)], ["Type", activeTarget.environment], ["Status", activeTarget.status], ["SHA", String(activeTarget.metadata?.sha ?? "-")]]} /> : null}
        {git?.dirty ? <VisualAlert tone="warning" title="Working tree has local changes" message="Git will refuse unsafe branch changes. Commit, stash, or clean local changes before syncing to another branch." /> : null}
        <div className="inline-actions"><button className="button" disabled={!activeTarget} onClick={() => void run("dry-run", activeTarget.id)} type="button">Dry Run</button><button className="button button-primary" disabled={!activeTarget} onClick={() => void run("sync", activeTarget.id)} type="button">Checkout Branch</button></div>
      </Panel>
      <Panel title="All Branches">
        <DataTable columns={["Branch", "Type", "Current", "Status", "SHA"]} rows={targets.map((item: any) => [<button className="link-button" onClick={() => setSelectedTargetId(item.id)} type="button">{item.name}</button>, item.environment, yesNo(item.metadata?.current), item.status, String(item.metadata?.sha ?? "-").slice(0, 12)])} />
      </Panel>
      <Panel title="History / Result">
        <Segmented value={historyTab} onChange={(value) => setHistoryTab(value as "versions" | "git" | "branches" | "actions")} options={["versions", "git", "branches", "actions"]} />
        {historyTab === "versions" ? <DataTable columns={["Version", "Refs", "Author", "Committed", "Message", "Rollback"]} rows={(git?.versions ?? []).map((version: any) => [
          <button className="link-button" onClick={() => setSelectedRun({ version })} type="button">{version.shortSha || String(version.sha).slice(0, 8)}<small>{String(version.sha).slice(0, 12)}</small></button>,
          version.refs?.length ? version.refs.join(", ") : "-",
          version.author,
          formatTime(version.committedAtMs),
          version.message,
          <button className="button" disabled={!activeTarget} onClick={() => void run("rollback", activeTarget.id, version.sha)} type="button">Rollback</button>
        ])} empty="No git versions discovered." /> : null}
        {historyTab === "git" ? <div className="git-state-panel">
          <DataTable columns={["Remote", "Direction", "URL"]} rows={(git?.remotes ?? []).map((remote: any) => [remote.name, remote.direction, remote.url])} empty="No git remotes configured." />
          {git?.status?.length ? <details className="json-details" open><summary>Working tree status</summary><pre>{git.status.join("\n")}</pre></details> : <VisualAlert tone="success" title="Working tree clean" message="No local changes detected." />}
        </div> : null}
        {historyTab === "branches" ? <DataTable columns={["Branch", "Current", "Remote", "Upstream", "SHA"]} rows={(git?.branches ?? []).map((branch: any) => [branch.name, yesNo(branch.current), yesNo(branch.remote), branch.upstream ?? "-", String(branch.sha ?? "-").slice(0, 12)])} empty="No branches discovered." /> : null}
        {historyTab === "actions" ? <DataTable columns={["Run", "Target", "Mode", "Status", "Message"]} rows={(snapshot?.payload?.runs ?? []).map((run: any) => [<button className="link-button" onClick={() => setSelectedRun(run)} type="button">{run.id.slice(0, 8)}</button>, run.targetId, run.mode ?? "-", run.status, run.message ?? "-"])} /> : null}
        {selectedRun ? <details className="json-details" open><summary>Selected result</summary><pre>{JSON.stringify(selectedRun, null, 2)}</pre></details> : null}
        <StatusText value={status} />
      </Panel>
    </section>
  );
}

export function DocsLive() {
  const api = useProgramApi("docs");
  const [snapshot, setSnapshot] = useState<any>(null);
  const [activePageId, setActivePageId] = useState("");
  const [page, setPage] = useState<any>(null);
  const [status, setStatus] = useState("");
  const refresh = useCallback(async () => setSnapshot(await api.get("snapshot")), [api]);
  useEffect(() => void refresh(), [refresh]);

  const pages = snapshot?.payload?.pages ?? [];
  const docsTree = useMemo(() => buildDocumentationTree(pages), [pages]);
  const activePage = pages.find((item: any) => item.id === activePageId) ?? pages[0];
  useEffect(() => {
    if (!activePage?.id) return;
    void api.post("get-page", { pageId: activePage.id }).then((result) => setPage(result.payload));
  }, [api, activePage?.id]);

  async function rebuild() {
    const result = await api.post("rebuild", {});
    setStatus(result.ok ? "Docs rebuilt" : result.error ?? "Rebuild failed");
    await refresh();
  }

  function selectLinkedPage(href: string): boolean {
    const target = resolveDocsLink(activePage, href);
    if (!target) return false;
    const candidates = docsLinkCandidates(target);
    const match = pages.find((item: any) => candidates.includes(docRouteKey(item)));
    if (!match) return false;
    setActivePageId(match.id);
    return true;
  }

  function handleViewerClick(event: MouseEvent<HTMLElement>) {
    const target = event.target instanceof HTMLElement ? event.target.closest("a") : null;
    if (!target) return;
    const href = target.getAttribute("href");
    if (!href) return;
    if (selectLinkedPage(href)) {
      event.preventDefault();
    }
  }

  return (
    <section className="docs-program-layout">
      <aside className="docs-explorer-panel">
        <div className="docs-explorer-header">
          <div><h2 className="panel-title">Docs</h2><p className="panel-kicker">Repository documentation</p></div>
          <div className="inline-actions"><button className="button" onClick={refresh} type="button">Refresh</button><button className="button button-primary" onClick={rebuild} type="button">Rebuild</button></div>
        </div>
        <div className="docs-sidebar-summary"><strong>{pages.length}</strong><span>docs files</span></div>
        <SummaryStrip items={[["Generated", snapshot?.payload?.generatedPages ?? 0], ["Sources", snapshot?.payload?.sources?.length ?? 0], ["Warnings", snapshot?.payload?.warnings?.length ?? 0]]} />
        <div className="docs-file-tree">{docsTree.children.map((node) => <DocsTreeNodeView activePageId={activePage?.id} key={node.path} node={node} onSelect={setActivePageId} />)}</div>
      </aside>
      <main className="docs-viewer-panel">
        <div className="panel-heading">
          <div><h2 className="panel-title">{page?.title ?? "Viewer"}</h2><p className="panel-kicker">{page?.routePath ?? "Select a documentation file"}</p></div>
          <span className="program-chip">{formatTime(snapshot?.payload?.generatedAtMs)}</span>
        </div>
        {snapshot?.payload?.warnings?.length ? <details className="json-details"><summary>Warnings</summary><pre>{snapshot.payload.warnings.join("\n")}</pre></details> : null}
        {page?.format === "html" ? <iframe className="docs-rendered docs-html-frame" sandbox="" srcDoc={sandboxedDocumentationHtml(page.html)} title={page.title ?? "Documentation"} /> : null}
        {page && page.format !== "html" ? <article className="docs-rendered" onClick={handleViewerClick} dangerouslySetInnerHTML={{ __html: page.html }} /> : null}
        {!page ? <p className="muted-text">Select a page to view rendered documentation.</p> : null}
        <StatusText value={status} />
      </main>
    </section>
  );
}

type DocsTreeNode = {
  name: string;
  path: string;
  children: DocsTreeNode[];
  page?: any;
};

function DocsTreeNodeView(props: { node: DocsTreeNode; activePageId: string | undefined; onSelect(pageId: string): void }) {
  const [open, setOpen] = useState(() => !shouldCollapseDocsFolder(props.node));
  const hasChildren = props.node.children.length > 0;
  const selected = props.node.page?.id === props.activePageId;
  if (props.node.page && !hasChildren) {
    return (
      <button className={selected ? "docs-tree-file selected" : "docs-tree-file"} onClick={() => props.onSelect(props.node.page.id)} type="button">
        <FileText size={14} aria-hidden />
        <span>{props.node.name}</span>
      </button>
    );
  }
  return (
    <section className="docs-tree-folder">
      <button className="docs-tree-folder-label" onClick={() => setOpen((value) => !value)} type="button">
        {open ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
        <FolderOpen size={15} aria-hidden />
        <span>{props.node.name}</span>
      </button>
      {open ? <div className="docs-tree-children">
        {props.node.page ? <button className={selected ? "docs-tree-file selected" : "docs-tree-file"} onClick={() => props.onSelect(props.node.page.id)} type="button"><FileText size={14} aria-hidden /><span>{props.node.page.title}</span></button> : null}
        {props.node.children.map((child) => <DocsTreeNodeView activePageId={props.activePageId} key={child.path} node={child} onSelect={props.onSelect} />)}
      </div> : null}
    </section>
  );
}

export function ProductionRunnerLive() {
  const api = useProgramApi("production-runner");
  const [snapshot, setSnapshot] = useState<any>(null);
  const [targetType, setTargetType] = useState("task");
  const [targetId, setTargetId] = useState("");
  const [loops, setLoops] = useState("1");
  const [waitMs, setWaitMs] = useState("0");
  const [initialDelayMs, setInitialDelayMs] = useState("0");
  const [parametersText, setParametersText] = useState("{}");
  const [showParameters, setShowParameters] = useState(false);
  const [consoleView, setConsoleView] = useState<"workloads" | "logs">("workloads");
  const [logFilter, setLogFilter] = useState("all");
  const [status, setStatus] = useState("");
  const refresh = useCallback(async () => setSnapshot(await api.get("snapshot")), [api]);
  useEffect(() => void refresh(), [refresh]);

  const targets = snapshot?.payload?.targets ?? [];
  const runs = snapshot?.payload?.runs ?? [];
  const targetOptions = targets.filter((target: any) => target.type === targetType);
  const selectedTarget = targetOptions.find((target: any) => target.id === targetId) ?? targetOptions[0];
  const activeRuns = runs.filter((run: any) => ["running", "scheduled", "starting"].includes(run.status));
  const logRows = flattenRunLogs(runs).filter((entry) => logFilter === "all" || entry.status === logFilter || entry.type === logFilter);

  async function startRun() {
    const params = parseJsonObject(parametersText);
    if (!params.ok) { setStatus(params.error); return; }
    const result = await api.post("start", {
      name: selectedTarget?.name ?? "Manual Run",
      targetType: selectedTarget?.type ?? targetType,
      targetId: selectedTarget?.id,
      loopsTotal: Number(loops) || 1,
      waitMs: Number(waitMs) || 0,
      initialDelayMs: Number(initialDelayMs) || 0,
      metadata: params.value
    });
    setStatus(result.ok ? "Run started" : result.error ?? "Run failed");
    await refresh();
  }

  return (
    <section className="program-workspace-grid">
      <Panel title="Launch Workload" action={<button className="button button-primary" disabled={!selectedTarget} onClick={startRun} type="button">Run {targetType}</button>}>
        <Segmented value={targetType} onChange={setTargetType} options={["routine", "task", "interface"]} />
        <div className="field-row dense-fields">
          <Field label="Target"><select value={selectedTarget?.id ?? ""} onChange={(event) => setTargetId(event.target.value)}>{targetOptions.map((target: any) => <option key={target.id} value={target.id}>{target.name}</option>)}</select></Field>
          <Field label="Loops"><input inputMode="numeric" value={loops} onChange={(event) => setLoops(digits(event.target.value))} /></Field>
          <Field label="Loop delay ms"><input inputMode="numeric" value={waitMs} onChange={(event) => setWaitMs(digits(event.target.value))} /></Field>
          <Field label="Start delay ms"><input inputMode="numeric" value={initialDelayMs} onChange={(event) => setInitialDelayMs(digits(event.target.value))} /></Field>
          <button className="button" onClick={() => setShowParameters((value) => !value)} type="button">{showParameters ? "Hide parameters" : "Parameters"}</button>
        </div>
        {showParameters ? <Field label="Parameters JSON"><textarea className="json-editor compact" value={parametersText} onChange={(event) => setParametersText(event.target.value)} spellCheck={false} /></Field> : null}
      </Panel>
      <Panel title="Console" action={<div className="inline-actions"><button className={consoleView === "workloads" ? "button button-primary" : "button"} onClick={() => setConsoleView("workloads")} type="button">Workloads</button><button className={consoleView === "logs" ? "button button-primary" : "button"} onClick={() => setConsoleView("logs")} type="button">Logs</button><button className="button" onClick={refresh} type="button">Refresh</button></div>}>
        <SummaryStrip items={[["Active", activeRuns.length], ["Runs", runs.length], ["Targets", targets.length], ["Failures", runs.filter((run: any) => run.status === "failed").length]]} />
        {consoleView === "workloads" ? <WorkloadBoard runs={activeRuns} onAdvance={(runId) => api.post("advance", { runId }).then(refresh)} onCancel={(runId) => api.post("cancel", { runId }).then(refresh)} /> : <>
          <div className="field-row dense-fields"><Field label="Log filter"><select value={logFilter} onChange={(event) => setLogFilter(event.target.value)}><option value="all">All</option><option value="task">Tasks</option><option value="routine">Routines</option><option value="interface">Interfaces</option><option value="failed">Failed</option><option value="success">Success</option></select></Field></div>
          <DataTable columns={["Time", "Target", "Loop", "Status", "Message"]} rows={logRows.map((entry) => [formatTime(entry.atMs), entry.target, entry.loop, entry.status, entry.message])} empty="No execution logs yet." />
        </>}
        <StatusText value={status} />
      </Panel>
      <Panel title="Targets">
        <DataTable columns={["Target", "Type", "Domain", "Description"]} rows={targets.map((target: any) => [target.name, target.type, target.domainId ?? "global", target.description ?? "-"])} />
      </Panel>
    </section>
  );
}

function WorkloadBoard(props: { runs: any[]; onAdvance(runId: string): Promise<unknown>; onCancel(runId: string): Promise<unknown> }) {
  if (!props.runs.length) return <div className="production-empty-state"><strong>No active workloads</strong><span>Launch a routine, task, or interface to populate the operations table.</span></div>;
  const groups = ["routine", "task", "interface"];
  return <div className="workload-board"><div className="workload-board-header"><span>Runtime</span>{groups.map((group) => <span key={group}>{group}s</span>)}</div><div className="workload-board-row"><div className="workload-runtime"><strong>Framework runtime</strong><small>Local execution</small></div>{groups.map((group) => <div className="workload-cell" key={group}>{props.runs.filter((run) => (run.targetType ?? "task") === group).map((run) => <article className="workload-chip" key={run.id}><header><strong>{run.name}</strong><StatusBadge value={run.status} /></header><div className="progress-track"><span style={{ width: `${Math.round(((run.loopsCompleted ?? 0) / Math.max(1, run.loopsTotal ?? 1)) * 100)}%` }} /></div><footer><span>{run.loopsCompleted ?? 0}/{run.loopsTotal ?? 1}</span><span>{formatTime(run.nextRunAtMs)}</span></footer><div className="inline-actions"><button className="button" onClick={() => void props.onAdvance(run.id)} type="button">Advance</button><button className="button" onClick={() => void props.onCancel(run.id)} type="button">Cancel</button></div></article>)}</div>)}</div></div>;
}

function yesNo(value: unknown): string {
  return value ? "Yes" : "No";
}

function formatTime(value: unknown): string {
  return typeof value === "number" && value > 0 ? new Date(value).toLocaleString() : "-";
}
function isSensitiveDatabaseStore(kind: string): boolean {
  return kind.trim().toLowerCase() === "identity.users";
}

function sensitiveStoreKey(kind: string, database: string): string {
  return `${database}:${kind.trim().toLowerCase()}`;
}

function buildDocumentationTree(pages: any[]): DocsTreeNode {
  const root: DocsTreeNode = { name: "docs", path: "", children: [] };
  for (const page of [...pages].sort((left, right) => docRouteKey(left).localeCompare(docRouteKey(right)))) {
    const route = docRouteKey(page);
    const parts = route.split("/").filter(Boolean);
    const fileName = parts.pop() ?? page.title ?? "index";
    let current = root;
    for (const part of parts) {
      const path = current.path ? `${current.path}/${part}` : part;
      let child = current.children.find((node) => node.path === path && !node.page);
      if (!child) {
        child = { name: titleFromRouteSegment(part), path, children: [] };
        current.children.push(child);
      }
      current = child;
    }
    current.children.push({
      name: titleFromRouteSegment(fileName),
      path: `file:${route}:${page.id}`,
      children: [],
      page
    });
  }
  sortDocsTree(root);
  return root;
}

function sortDocsTree(node: DocsTreeNode): void {
  node.children.sort((left, right) => {
    if (Boolean(left.page) !== Boolean(right.page)) return left.page ? 1 : -1;
    return left.name.localeCompare(right.name);
  });
  for (const child of node.children) sortDocsTree(child);
}

function shouldCollapseDocsFolder(node: DocsTreeNode): boolean {
  const path = node.path.toLowerCase();
  const name = node.name.toLowerCase();
  if (!path) return false;
  if (path.startsWith("generated/reference/typedoc/assets")) return true;
  if (path.startsWith("generated/reference/typedoc/classes")) return true;
  if (path.startsWith("generated/reference/typedoc/types")) return true;
  if (["classes", "types", "functions", "variables", "assets"].includes(name) && path.startsWith("generated/")) return true;
  return node.children.length > 30 && path.startsWith("generated/");
}

function docRouteKey(page: any): string {
  return normalizeDocPath(String(page?.routePath ?? page?.path ?? page?.id ?? ""));
}

function normalizeDocPath(value: string): string {
  const withoutHash = value.split("#")[0] ?? "";
  const withoutQuery = withoutHash.split("?")[0] ?? "";
  const normalized = withoutQuery
    .replaceAll("\\", "/")
    .replace(/^\/+/, "")
    .replace(/\.(md|mdx|html|json)$/i, "");
  const parts: string[] = [];
  for (const part of normalized.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function resolveDocsLink(activePage: any, href: string): string | null {
  const clean = href.trim();
  if (!clean || clean.startsWith("#") || /^(https?:|mailto:|javascript:)/i.test(clean)) return null;
  const current = docRouteKey(activePage);
  if (clean.startsWith("/")) return normalizeDocPath(clean);
  const currentDir = current.includes("/") ? current.slice(0, current.lastIndexOf("/")) : "";
  return normalizeDocPath(currentDir ? `${currentDir}/${clean}` : clean);
}

function docsLinkCandidates(target: string): string[] {
  const normalized = normalizeDocPath(target);
  const values = new Set<string>([normalized]);
  if (normalized.endsWith("/index")) values.add(normalized.replace(/\/index$/, ""));
  if (normalized.endsWith("/README")) values.add(normalized.replace(/\/README$/, ""));
  if (normalized && !normalized.endsWith("/index") && !normalized.endsWith("/README")) {
    values.add(`${normalized}/index`);
    values.add(`${normalized}/README`);
  }
  if (!normalized) {
    values.add("index");
    values.add("README");
  }
  return [...values];
}

function titleFromRouteSegment(value: string): string {
  if (/^README$/i.test(value.replace(/\.(md|mdx|html|json)$/i, ""))) return "README";
  return value
    .replace(/\.(md|mdx|html|json)$/i, "")
    .replace(/^index$/i, "Index")
    .split(/[-_.\s]+/g)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function formatDuration(value: unknown): string {
  if (typeof value !== "number" || value <= 0) return "-";
  const minutes = Math.round(value / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hr`;
  return `${Math.round(hours / 24)} days`;
}

function formatCountdown(task: any, nowMs: number, schedulerRunning = true): string {
  if (!task?.enabled) return "Stopped";
  if (!schedulerRunning) return "Paused";
  if (!task.nextRunAtMs) return "Manual";
  const remainingSeconds = Math.max(0, Math.ceil((Number(task.nextRunAtMs) - nowMs) / 1000));
  if (remainingSeconds <= 0) return "Due now";
  const days = Math.floor(remainingSeconds / 86_400);
  const hours = Math.floor((remainingSeconds % 86_400) / 3_600);
  const minutes = Math.floor((remainingSeconds % 3_600) / 60);
  const seconds = remainingSeconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function scheduleProgress(task: any, nowMs = Date.now()): string {
  if (!task?.intervalMs || !task.nextRunAtMs) return "0%";
  const remaining = Math.max(0, Number(task.nextRunAtMs) - nowMs);
  const elapsedRatio = 1 - remaining / Number(task.intervalMs);
  return `${Math.max(4, Math.min(100, elapsedRatio * 100))}%`;
}

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function copyText(value: string): void {
  if (!value) return;
  void navigator.clipboard?.writeText(value);
}

function emptyCredentialEdit(kind: "password" | "pin") {
  return {
    kind,
    value: "",
    confirm: "",
    authorizationPassword: "",
    authorizationPin: "",
    authorizationTotp: ""
  };
}

function csv(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function shortJson(value: unknown): string {
  if (!value) return "-";
  const text = JSON.stringify(value);
  return text.length > 90 ? `${text.slice(0, 90)}...` : text;
}

function sandboxedDocumentationHtml(html: string): string {
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:"></head><body>${html}</body></html>`;
}

function formatDbCell(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return shortJson(value);
}

function parseJsonObject(text: string): { ok: true; value: JsonObject } | { ok: false; error: string } {
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? { ok: true, value: value as JsonObject } : { ok: false, error: "JSON must be an object" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function flattenRunLogs(runs: any[]): Array<{ atMs: number; target: string; loop: string; status: string; message: string; type: string }> {
  return runs.flatMap((run) => {
    const executions = run.executions ?? [];
    if (!executions.length) return [{ atMs: run.updatedAtMs ?? run.startedAtMs ?? 0, target: run.targetId ?? run.name, loop: `${run.loopsCompleted ?? 0}/${run.loopsTotal ?? 1}`, status: run.status, message: run.metadata?.message ?? "-", type: run.targetType ?? "run" }];
    return executions.map((execution: any) => ({ atMs: execution.atMs, target: run.targetId ?? run.name, loop: `${execution.loop}/${run.loopsTotal ?? 1}`, status: execution.ok ? "success" : "failed", message: execution.error ?? shortJson(execution.result), type: run.targetType ?? "run" }));
  });
}

