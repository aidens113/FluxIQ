"use client";

import { KeyRound, MoreHorizontal, Pencil, RefreshCcw, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { SecretKeysSnapshotResponse, SecretKeySummary } from "fluxiq/secret-keys";
import { useProgramApi, type ApiResponse, type JsonObject } from "../../../programs/program-api";
import { DataTable, EmptyState, Field, KeyValue, LoadingState, Menu, Modal, Panel, StatusBadge, StatusText, VisualAlert } from "../../../programs/shared-ui";
import type { CurrentUser } from "../../../programs/types";
import { OperationBusyBoundary, useOperationLock } from "../../../programs/use-operation-lock";
import { reconcileVisibleSelection } from "../../../programs/selection";
import { digits, formatTime } from "../../../programs/format";
import { KeyAvailability } from "../KeyAvailability";
import { shapeKeyRow } from "../../model";
import { useSecretScopeCatalog } from "./scope-catalog";

// The logins and keys a Flow uses on other sites and services. A person's AI key is added in Settings, under AI
// keys, so this list never shows one. A saved value is never shown again: it is replaced, not revealed. The
// password is asked in the same dialog as the change, and a two-step code only when the person turned that on.

type SecretForm = {
  name: string;
  value: string;
  provider: string;
  scope: "global" | "domain" | "flow" | "custom";
  scopeRef: string;
  description: string;
  metadata: JsonObject;
  enabled: boolean;
};

type AuthForm = {
  password: string;
  totp: string;
};

const emptyAuth: AuthForm = { password: "", totp: "" };
const emptySecretForm: SecretForm = {
  name: "",
  value: "",
  provider: "",
  scope: "global",
  scopeRef: "",
  description: "",
  metadata: {},
  enabled: true
};
const SCOPE_WORDS: Record<SecretForm["scope"], string> = { global: "Everywhere", domain: "One website", flow: "One Flow", custom: "Something else" };

export function SecretKeysLive({ currentUser }: { currentUser: CurrentUser }) {
  const api = useProgramApi("secret-keys");
  const automationApi = useProgramApi("automation-studio");
  const owner = useRef({ api, automationApi, actor: currentUser.id, key: 0 });
  if (owner.current.api !== api || owner.current.automationApi !== automationApi || owner.current.actor !== currentUser.id) owner.current = { api, automationApi, actor: currentUser.id, key: owner.current.key + 1 };
  const isOwner = useCallback(() => owner.current.api === api && owner.current.automationApi === automationApi && owner.current.actor === currentUser.id, [api, automationApi, currentUser.id]);
  return <SecretWorkspace key={owner.current.key} api={api} automationApi={automationApi} currentUser={currentUser} isOwner={isOwner} />;
}

function SecretWorkspace({ api, automationApi, currentUser, isOwner }: { api: ReturnType<typeof useProgramApi>; automationApi: ReturnType<typeof useProgramApi>; currentUser: CurrentUser; isOwner(): boolean }) {
  const mounted = useRef(false), pending = useRef<object | null>(null);
  const proof = useRef({ signature: "", revision: 0 });
  const signature = String(currentUser.totpEnabled);
  if (proof.current.signature !== signature) proof.current = { signature, revision: proof.current.revision + 1 };
  const revision = proof.current.revision;
  const current = useCallback(() => mounted.current && isOwner() && proof.current.revision === revision, [isOwner, revision]);
  const canOpen = () => pending.current === null;
  const read = useRef<AbortController | null>(null), confirmedKeys = useRef<SecretKeySummary[]>([]);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      read.current?.abort();
      read.current = null;
      pending.current = null;
    };
  }, []);
  const [snapshot, setSnapshot] = useState<ApiResponse<SecretKeysSnapshotResponse> | null>(null);
  const [status, setStatus] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [enabledFilter, setEnabledFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [createForm, setCreateForm] = useState<SecretForm>(emptySecretForm);
  const createDialog = useSecretDialog<AuthForm>(current, revision, canOpen);
  const editDialog = useSecretDialog<{ key: SecretKeySummary; form: SecretForm; auth: AuthForm }>(current, revision, canOpen);
  const replaceDialog = useSecretDialog<{ key: SecretKeySummary; value: string; auth: AuthForm }>(current, revision, canOpen);
  const removeDialog = useSecretDialog<{ key: SecretKeySummary; auth: AuthForm }>(current, revision, canOpen);
  const createAuthorization = createDialog.value;
  const exists = (draft: { key: SecretKeySummary } | null) => Boolean(draft && confirmedKeys.current.some(key => key.id === draft.key.id));
  const edit = exists(editDialog.value) ? editDialog.value : null;
  const replace = exists(replaceDialog.value) ? replaceDialog.value : null;
  const remove = exists(removeDialog.value) ? removeDialog.value : null;
  useEffect(() => {
    const removed = Boolean(editDialog.value && !edit || replaceDialog.value && !replace || removeDialog.value && !remove);
    if (editDialog.value && !edit) editDialog.close();
    if (replaceDialog.value && !replace) replaceDialog.close();
    if (removeDialog.value && !remove) removeDialog.close();
    if (removed) setStatus("That was closed because the login or key is gone.");
  }, [editDialog.value, edit, replaceDialog.value, replace, removeDialog.value, remove]);
  const [selectedId, setSelectedId] = useState("");
  const wizard = useRef(0), wizardEpoch = wizard.current;
  const operation = useOperationLock();

  const [readError, setReadError] = useState("");
  const [reading, setReading] = useState(false);
  const refresh = useCallback(async () => {
    if (!current() || read.current) return;
    const controller = new AbortController();
    read.current = controller;
    setReading(true);
    setReadError("");
    try {
      const result = await api.get<SecretKeysSnapshotResponse>("snapshot", { signal: controller.signal });
      if (!current() || controller.signal.aborted || read.current !== controller) return;
      if (result.ok && validSecretSnapshot(result.payload)) {
        confirmedKeys.current = result.payload.keys;
        setSnapshot(result);
      }
      else setReadError("Your saved logins and keys could not be loaded. Try again.");
    } catch { if (current() && read.current === controller && !controller.signal.aborted) setReadError("Your saved logins and keys could not be loaded. Try again."); }
    finally { if (current() && read.current === controller) {
      read.current = null;
      setReading(false);
    } }
  }, [api, current]);
  useEffect(() => {
    void refresh();
    return () => {
      read.current?.abort();
      read.current = null;
    };
  }, [refresh]);
  const scopeCatalog = useSecretScopeCatalog({ api: automationApi, active: createOpen || Boolean(edit), epoch: createOpen || createAuthorization ? "create:" + wizard.current : "edit:" + (edit?.dialogEpoch ?? "closed"), isOwner: current });
  const loadScopeProject = scopeCatalog.loadProject;

  // An AI key is managed in Settings, so only the logins and keys for Flows are listed here.
  const keys = useMemo(() => (snapshot?.payload?.keys ?? []).filter((key) => key.kind !== "llm"), [snapshot]);
  const filteredKeys = useMemo(() => filterSecretKeys(keys, query, enabledFilter), [enabledFilter, keys, query]);
  const visibleKeyId = reconcileVisibleSelection(filteredKeys, selectedId, (key) => key.id);
  const selected = filteredKeys.find((key) => key.id === visibleKeyId) ?? null;
  useEffect(() => {
    const nextId = selected?.id ?? "";
    if (selectedId !== nextId) setSelectedId(nextId);
  }, [selected?.id, selectedId]);
  const scopeOptionsFor = (scope: SecretForm["scope"]) => [...new Set([
    ...keys.filter((key) => key.scope === scope).map((key) => key.scopeRef).filter((value): value is string => Boolean(value)),
    ...(scope === "domain" ? scopeCatalog.domains.map((item) => item.id) : []),
    ...(scope === "flow" ? scopeCatalog.flows.map((item) => item.id) : [])
  ])];
  const closeWizard = () => { if (current() && wizard.current === wizardEpoch) {
    wizard.current++;
    setCreateOpen(false);
    setCreateForm(emptySecretForm);
    createDialog.close();
  } };
  const knownKey = (key: SecretKeySummary) => confirmedKeys.current.some(row => row.id === key.id);
  async function mutate(name: string, valid: () => boolean, task: () => Promise<void>) {
    if (!current() || !valid()) return;
    await operation.run(name, async () => {
      if (!current() || !valid()) return;
      const token = {};
      pending.current = token;
      read.current?.abort();
      read.current = null;
      setReading(false);
      try { await task(); } catch { if (current() && valid()) setStatus("That did not work. Try again."); }
      finally { if (pending.current === token) pending.current = null; }
    });
  }
  async function createKey() {
    if (!createAuthorization || !createDialog.sameDraft(createAuthorization) || !canPrepareSecret(createForm) || !canSubmitAuth(createAuthorization, currentUser, false)) return;
    const draft = createAuthorization;
    await mutate("create-key", () => createDialog.current(draft), async () => {
      const result = await api.post("create-key", { ...formPayload(createForm), ...authPayload(draft) });
      if (!current() || !createDialog.current(draft)) return;
      setStatus(result.ok ? "Saved." : "That did not save. Try again.");
      if (result.ok) {
        wizard.current++;
        setCreateOpen(false);
        setCreateForm(emptySecretForm);
        createDialog.close();
        await refresh();
      }
    });
  }
  async function saveEdit() {
    if (!edit || !editDialog.sameDraft(edit) || !canSubmitAuth(edit.auth, currentUser)) return;
    const draft = edit, valid = () => editDialog.current(draft) && knownKey(draft.key);
    await mutate("update-key", valid, async () => {
      const result = await api.post("update-key", { id: draft.key.id, ...formPayload({ ...draft.form, value: "" }, false), ...authPayload(draft.auth) });
      if (!current() || !valid()) return;
      setStatus(result.ok ? "Details updated." : "That did not save. Try again.");
      if (result.ok) {
        editDialog.close();
        await refresh();
      }
    });
  }
  async function replaceKey() {
    if (!replace || !replaceDialog.sameDraft(replace) || !replace.value || !canSubmitAuth(replace.auth, currentUser)) return;
    const draft = replace, valid = () => replaceDialog.current(draft) && knownKey(draft.key);
    await mutate("rotate-key", valid, async () => {
      const result = await api.post("rotate-key", { id: draft.key.id, value: draft.value, ...authPayload(draft.auth) });
      if (!current() || !valid()) return;
      setStatus(result.ok ? "Replaced." : "That could not be replaced. Try again.");
      if (result.ok) {
        replaceDialog.close();
        await refresh();
      }
    });
  }
  async function deleteKey() {
    if (!remove || !removeDialog.sameDraft(remove) || !canSubmitAuth(remove.auth, currentUser)) return;
    const draft = remove, valid = () => removeDialog.current(draft) && knownKey(draft.key);
    await mutate("delete-key", valid, async () => {
      const result = await api.post("delete-key", { id: draft.key.id, ...authPayload(draft.auth) });
      if (!current() || !valid()) return;
      setStatus(result.ok ? "Removed." : "That could not be removed. Try again.");
      if (result.ok) {
        removeDialog.close();
        setSelectedId("");
        await refresh();
      }
    });
  }
  if (!snapshot && !readError) return <LoadingState label="Loading your saved logins and keys" detail="Only their names and details are read. A saved value is never included." />;
  if (!snapshot) return <EmptyState title="Saved logins and keys unavailable" description={readError} action={<button className="button" onClick={() => void refresh()} type="button">Retry</button>} />;

  return (
    <OperationBusyBoundary busy={operation.busy}><section aria-busy={operation.busy || undefined} className="secret-keys-workspace">
      <header className="program-inner-header"><div><strong>Saved logins and keys for Flows</strong><span>What your Flows use to sign in to other sites and services. FluxIQ keeps each one and never shows it again.</span></div><div className="inline-actions"><StatusText value={operation.activeOperation ? "Working on it..." : status} /><button className="button" disabled={operation.busy || reading} onClick={() => void refresh()} type="button"><RefreshCcw size={14} aria-hidden />Refresh</button><button className="button button-primary" disabled={operation.busy} onClick={() => { if (current() && canOpen()) {
        wizard.current++;
        setCreateOpen(true);
        createDialog.open(emptyAuth);
      } }} type="button"><KeyRound size={14} aria-hidden />Add login or key</button></div></header>
      {status ? <p role="status" aria-live="polite">{status}</p> : null}
      {readError ? <VisualAlert tone="warning" title="Could not refresh" message={readError} /> : null}
      {readError ? <button className="button" disabled={reading || operation.busy} onClick={() => void refresh()} type="button">Try again</button> : null}
      <div className="secret-keys-list-detail">
        <Panel title="Saved">
          <div className="program-list-toolbar"><label className="program-search-field"><Search size={14} aria-hidden /><input aria-label="Search saved logins and keys" onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, service or where it's used" type="search" value={query} /></label><select aria-label="Filter by status" onChange={(event) => setEnabledFilter(event.target.value as typeof enabledFilter)} value={enabledFilter}><option value="all">All</option><option value="enabled">Turned on</option><option value="disabled">Turned off</option></select></div>
          <DataTable label="Saved logins and keys" columns={["Name", "Used for", "Status", "Where it's used", "Updated", "Actions"]} rows={filteredKeys.map((key) => [
            <button aria-current={selected?.id === key.id ? "true" : undefined} className="identity-user-link" onClick={() => { if (current() && knownKey(key)) setSelectedId(key.id); }} type="button"><strong>{key.name}</strong><small>{key.enabled ? "Turned on" : "Turned off"}</small></button>,
            <span className="secret-provider-cell"><strong>{key.provider || "Not named"}</strong></span>,
            <KeyAvailability row={shapeKeyRow(key)} />,
            <span className="secret-scope-cell"><strong>{SCOPE_WORDS[key.scope]}</strong>{key.scopeRef ? <small>{key.scopeRef}</small> : null}</span>,
            formatTime(key.updatedAtMs),
            <Menu icon={<MoreHorizontal size={15} aria-hidden />} iconOnly label={"Actions for " + key.name} options={[
              { id: "edit", label: "Edit details", icon: <Pencil size={14} aria-hidden />, onSelect: () => {
                if (!current() || !knownKey(key) || !canOpen()) return;
                setSelectedId(key.id);
                editDialog.open({ key, form: formFromKey(key), auth: emptyAuth });
              } },
              { id: "replace", label: "Replace", icon: <RefreshCcw size={14} aria-hidden />, onSelect: () => {
                if (!current() || !knownKey(key) || !canOpen()) return;
                setSelectedId(key.id);
                replaceDialog.open({ key, value: "", auth: emptyAuth });
              } },
              { id: "remove", label: "Remove", icon: <Trash2 size={14} aria-hidden />, danger: true, onSelect: () => {
                if (!current() || !knownKey(key) || !canOpen()) return;
                setSelectedId(key.id);
                removeDialog.open({ key, auth: emptyAuth });
              } }
            ]} />
          ])} empty={keys.length ? "Nothing matches these filters." : "No saved logins or keys yet. Your AI key is added in Settings, under AI keys."} />
        </Panel>
        <Panel title="Details">{selected ? <div className="secret-key-detail"><div className="secret-key-detail-heading"><span className="program-icon"><KeyRound size={18} aria-hidden /></span><span><strong>{selected.name}</strong><small>{selected.provider || "Not named"}</small></span><StatusBadge value={selected.enabled ? "Turned on" : "Turned off"} /></div><KeyValue rows={[["Service", selected.provider || "-"], ["Where it's used", selected.scopeRef ? SCOPE_WORDS[selected.scope] + ": " + selected.scopeRef : SCOPE_WORDS[selected.scope]], ["Description", selected.description || "-"], ["Added", formatTime(selected.createdAtMs)], ["Last replaced", formatTime(selected.lastRotatedAtMs)]]} /></div> : <EmptyState compact title="Nothing chosen" description="Choose a saved login or key to see its details." />}</Panel>
      </div>

      {createAuthorization ? <Modal title="Add a login or key" description="Save a login or key your Flows use on another site or service. FluxIQ keeps it and never shows it again." onClose={() => { if (createDialog.current(createAuthorization)) closeWizard(); }}><SecretFormFields form={createForm} includeValue scopeOptions={scopeOptionsFor(createForm.scope)} scopeCatalog={scopeCatalog} onProjectChange={(projectId) => void loadScopeProject(projectId)} onCatalogRetry={() => void scopeCatalog.retryCatalog()} onProjectRetry={() => void scopeCatalog.retryProject()} onChange={form => { if (current() && wizard.current === wizardEpoch) setCreateForm(form); }} /><AuthorizationFields auth={createAuthorization} currentUser={currentUser} requireTotp={false} onChange={createDialog.change} /><div className="modal-actions"><button className="button" onClick={() => closeWizard()} type="button">Cancel</button><button className="button button-primary" disabled={!canPrepareSecret(createForm) || !canSubmitAuth(createAuthorization, currentUser, false)} onClick={() => void createKey()} type="button">Save</button></div></Modal> : null}
      {edit ? <Modal title="Edit details" description="Change how this is named and where it is used. Its saved value stays as it is." onClose={() => editDialog.close()}><div className="secret-key-editor modal-secret-editor"><SecretFormFields form={edit.form} scopeOptions={scopeOptionsFor(edit.form.scope)} scopeCatalog={scopeCatalog} onProjectChange={(projectId) => void loadScopeProject(projectId)} onCatalogRetry={() => void scopeCatalog.retryCatalog()} onProjectRetry={() => void scopeCatalog.retryProject()} onChange={(form) => editDialog.change({ ...edit, form })} /><AuthorizationFields auth={edit.auth} currentUser={currentUser} onChange={(auth) => editDialog.change({ ...edit, auth })} /></div><div className="modal-actions"><button className="button" onClick={() => editDialog.close()} type="button">Cancel</button><button className="button button-primary" disabled={!canSubmitAuth(edit.auth, currentUser) || !edit.form.name.trim()} onClick={() => void saveEdit()} type="button">Save changes</button></div></Modal> : null}
      {replace ? <Modal title="Replace login or key" description={"Give " + replace.key.name + " a new value. Its name and where it is used stay as they are."} onClose={() => replaceDialog.close()}><div className="secret-modal-stack"><VisualAlert tone="warning" title="Takes effect at once" message="New runs use the replacement straight away. A run already under way may still use the old one." /><Field label="New value" required><input autoComplete="new-password" data-autofocus type="password" value={replace.value} onChange={(event) => replaceDialog.change({ ...replace, value: event.target.value })} /></Field><AuthorizationFields auth={replace.auth} currentUser={currentUser} onChange={(auth) => replaceDialog.change({ ...replace, auth })} /></div><div className="modal-actions"><button className="button" onClick={() => replaceDialog.close()} type="button">Cancel</button><button className="button button-primary" disabled={!replace.value || !canSubmitAuth(replace.auth, currentUser)} onClick={() => void replaceKey()} type="button">Save new value</button></div></Modal> : null}
      {remove ? <Modal title="Remove login or key" description={"Remove " + remove.key.name + " for good. FluxIQ forgets it."} onClose={() => removeDialog.close()}><div className="secret-modal-stack"><VisualAlert tone="warning" title="Flows that use it" message="Flows that use this will no longer be able to find it." /><AuthorizationFields auth={remove.auth} currentUser={currentUser} onChange={(auth) => removeDialog.change({ ...remove, auth })} /></div><div className="modal-actions"><button className="button" onClick={() => removeDialog.close()} type="button">Cancel</button><button className="button button-danger" disabled={!canSubmitAuth(remove.auth, currentUser)} onClick={() => void deleteKey()} type="button">Remove for good</button></div></Modal> : null}
    </section></OperationBusyBoundary>
  );
}
type SecretDialog<T> = T & { dialogEpoch: number; proofRevision: number };
function useSecretDialog<T extends object>(isCurrent: () => boolean, proofRevision: number, canOpen: () => boolean) {
  const [state, setState] = useState<SecretDialog<T> | null>(null);
  const sequence = useRef(0), latest = useRef(state);
  const value = state?.proofRevision === proofRevision ? state : null;
  latest.current = value;
  const current = (candidate: SecretDialog<T> | null) => Boolean(isCurrent() && candidate && latest.current?.dialogEpoch === candidate.dialogEpoch && candidate.proofRevision === proofRevision);
  const publish = (next: SecretDialog<T> | null) => {
    latest.current = next;
    setState(next);
  };
  useEffect(() => { if (state && state.proofRevision !== proofRevision) setState(null); }, [proofRevision, state]);
  return {
    value, current, sameDraft: (candidate: SecretDialog<T>) => current(candidate) && latest.current === candidate,
    open(next: T) { if (isCurrent() && canOpen()) publish({ ...next, dialogEpoch: ++sequence.current, proofRevision }); },
    change(next: T) { if (current(value) && latest.current === value) publish({ ...next, dialogEpoch: value!.dialogEpoch, proofRevision }); },
    close() { if (current(value)) publish(null); }
  };
}
function validSecretKey(value: unknown): value is SecretKeySummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && Boolean(row.id) && typeof row.name === "string" && (row.kind === "llm" || row.kind === "custom") && typeof row.scope === "string" && ["global", "domain", "flow", "custom"].includes(row.scope) && typeof row.enabled === "boolean" && [row.createdAtMs, row.updatedAtMs, row.lastRotatedAtMs].every(v => typeof v === "number" && Number.isFinite(v)) && [row.provider, row.scopeRef, row.description].every(v => v === undefined || typeof v === "string") && (row.metadata === undefined || Boolean(row.metadata) && typeof row.metadata === "object" && !Array.isArray(row.metadata)) && (row.lastRevealedAtMs === undefined || typeof row.lastRevealedAtMs === "number" && Number.isFinite(row.lastRevealedAtMs));
}
function validSecretSnapshot(value: unknown): value is SecretKeysSnapshotResponse {
  if (!value || typeof value !== "object") return false;
  const keys = (value as { keys?: unknown }).keys;
  return Array.isArray(keys) && keys.every(validSecretKey) && new Set(keys.map(key => key.id)).size === keys.length;
}

function SecretFormFields(props: { form: SecretForm; includeValue?: boolean; scopeOptions?: string[]; scopeCatalog?: { domains: Array<{ id: string; label: string }>; projects: Array<{ id: string; label: string }>; flows: Array<{ id: string; label: string }>; projectId: string; loading: boolean; error: string }; onCatalogRetry?(): void; onProjectRetry?(): void; onProjectChange?(projectId: string): void; onChange(form: SecretForm): void }) {
  const { form, onChange } = props;
  const referenceLabel = form.scope === "domain" ? "Website" : form.scope === "flow" ? "Flow" : "Which one";
  return (
    <div className="secret-form-sections">
      <div className="secret-form-section">
        <div className="field-row dense-fields secret-keys-form">
          <Field label="Name"><input value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} /></Field>
          {props.includeValue ? <Field label="Login or key"><input autoComplete="off" type="password" value={form.value} onChange={(event) => onChange({ ...form, value: event.target.value })} /></Field> : null}
          <Field label="Service"><input placeholder="A website, vendor or app name" value={form.provider} onChange={(event) => onChange({ ...form, provider: event.target.value })} /></Field>
        </div>
      </div>
      <div className="secret-form-section secondary">
        <div className="field-row dense-fields secret-keys-form">
          <Field label="Where it's used"><select value={form.scope} onChange={(event) => {
            const scope = event.target.value as SecretForm["scope"];
            onChange({ ...form, scope, ...(scope === "global" ? { scopeRef: "" } : {}) });
          }}>{(Object.keys(SCOPE_WORDS) as Array<SecretForm["scope"]>).map((scope) => <option key={scope} value={scope}>{SCOPE_WORDS[scope]}</option>)}</select></Field>
          {form.scope === "flow" && props.scopeCatalog ? <Field hint="Flows load only for the project you pick." label="Project"><select disabled={props.scopeCatalog.loading && !props.scopeCatalog.projects.length} value={props.scopeCatalog.projectId} onChange={(event) => props.onProjectChange?.(event.target.value)}><option value="">Choose a project</option>{props.scopeCatalog.projects.map((project) => <option key={project.id} value={project.id}>{project.label}</option>)}</select></Field> : null}
          <Field hint={form.scope === "global" ? "Everywhere needs nothing more." : "Pick from the list or type the exact name."} label={referenceLabel}><input disabled={form.scope === "global" || (form.scope === "flow" && !props.scopeCatalog?.projectId)} list={form.scope === "global" ? undefined : "secret-scope-options-" + form.scope} placeholder={form.scope === "domain" ? "Choose or type a website" : form.scope === "flow" ? "Choose a project, then a Flow" : "Type its name"} value={form.scope === "global" ? "" : form.scopeRef} onChange={(event) => onChange({ ...form, scopeRef: event.target.value })} />{form.scope !== "global" && props.scopeOptions?.length ? <datalist id={"secret-scope-options-" + form.scope}>{props.scopeOptions.map((option) => <option key={option} value={option} />)}</datalist> : null}</Field>
          <Field label="Description"><input value={form.description} onChange={(event) => onChange({ ...form, description: event.target.value })} /></Field>
          {props.scopeCatalog?.error ? <div className="inline-actions"><button className="button" disabled={props.scopeCatalog.loading} onClick={props.onCatalogRetry} type="button">Retry the choices</button>{props.scopeCatalog.projectId ? <button className="button" disabled={props.scopeCatalog.loading} onClick={props.onProjectRetry} type="button">Retry this project&rsquo;s Flows</button> : null}</div> : null}
          {props.scopeCatalog?.error ? <VisualAlert tone="warning" title="Choices" message={props.scopeCatalog.error} /> : null}
          <label className="check-row"><input checked={form.enabled} onChange={(event) => onChange({ ...form, enabled: event.target.checked })} type="checkbox" />Turned on</label>
        </div>
      </div>
    </div>
  );
}

function AuthorizationFields(props: { auth: AuthForm; currentUser: CurrentUser; requireTotp?: boolean; onChange(auth: AuthForm): void }) {
  const { auth, currentUser, onChange } = props;
  const requireTotp = props.requireTotp ?? true;
  return (
    <div className="secret-auth-card">
      <div className="secret-auth-heading"><strong>Confirm it is you</strong><span>{requireTotp && currentUser.totpEnabled ? "Your password and your two-step code." : "Your password."}</span></div>
      <div className="field-row dense-fields secret-auth-fields">
        <Field label="Your password"><input type="password" value={auth.password} onChange={(event) => onChange({ ...auth, password: event.target.value })} /></Field>
        {currentUser.totpEnabled && requireTotp ? <Field label="Your two-step code"><input inputMode="numeric" value={auth.totp} onChange={(event) => onChange({ ...auth, totp: digits(event.target.value).slice(0, 6) })} /></Field> : null}
      </div>
    </div>
  );
}

function formFromKey(key: SecretKeySummary): SecretForm {
  return {
    name: key.name,
    value: "",
    provider: key.provider ?? "",
    scope: key.scope,
    scopeRef: key.scopeRef ?? "",
    description: key.description ?? "",
    metadata: key.metadata ?? {},
    enabled: key.enabled
  };
}

function formPayload(form: SecretForm, includeValue = true): JsonObject {
  return {
    name: form.name.trim(),
    ...(includeValue ? { value: form.value } : {}),
    kind: "custom",
    provider: form.provider.trim(),
    scope: form.scope,
    scopeRef: form.scopeRef.trim(),
    description: form.description.trim(),
    metadata: { ...form.metadata },
    enabled: form.enabled
  };
}

function authPayload(auth: AuthForm): JsonObject {
  return {
    authorizationPassword: auth.password,
    ...(auth.totp ? { authorizationTotp: auth.totp } : {})
  };
}

function canPrepareSecret(form: SecretForm): boolean {
  return Boolean(form.name.trim() && form.value);
}

export function canSubmitAuth(auth: AuthForm, currentUser: CurrentUser, requireTotp = true): boolean {
  return Boolean(auth.password && (!requireTotp || !currentUser.totpEnabled || auth.totp.length === 6));
}

const SCOPE_NAMES: Record<SecretForm["scope"], string> = { global: "everywhere", domain: "website", flow: "flow", custom: "something else" };

export function filterSecretKeys(keys: SecretKeySummary[], query: string, enabled: "all" | "enabled" | "disabled"): SecretKeySummary[] {
  const normalized = query.trim().toLocaleLowerCase();
  return keys.filter((key) => {
    if (enabled === "enabled" && !key.enabled) return false;
    if (enabled === "disabled" && key.enabled) return false;
    return !normalized || [key.name, key.provider ?? "", key.scope, SCOPE_NAMES[key.scope], key.scopeRef ?? ""].some((value) => value.toLocaleLowerCase().includes(normalized));
  });
}
