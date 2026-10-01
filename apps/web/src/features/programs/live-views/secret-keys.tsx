"use client";

import { Eye, KeyRound, MoreHorizontal, Pencil, RefreshCcw, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RevealSecretKeyResponse, SecretKeysSnapshotResponse, SecretKeySummary } from "fluxiq/secret-keys";
import { useProgramApi, type ApiResponse, type JsonObject } from "../program-api";
import { DataTable, EmptyState, Field, KeyValue, LoadingState, Menu, Modal, Panel, StatusBadge, StatusText, VisualAlert } from "../shared-ui";
import type { CurrentUser } from "../types";
import { OperationBusyBoundary, useOperationLock } from "../use-operation-lock";
import { reconcileVisibleSelection } from "../program-selection";
import { digits, formatTime } from "./shared";
import { useSecretScopeCatalog } from "../secret-scope-catalog";
import { ClipboardButton } from "../components";

type SecretForm = {
  name: string;
  value: string;
  kind: "llm" | "custom";
  provider: string;
  scope: "global" | "domain" | "flow" | "custom";
  scopeRef: string;
  description: string;
  model: string;
  metadata: JsonObject;
  enabled: boolean;
};

type AuthForm = {
  password: string;
  pin: string;
  totp: string;
};

const llmProviders = ["OpenAI", "Anthropic", "Google Gemini", "Azure OpenAI", "Groq", "Mistral", "DeepSeek", "OpenRouter", "Ollama", "Other"] as const;
const defaultLlmProvider = llmProviders[0];
const emptyAuth: AuthForm = { password: "", pin: "", totp: "" };
const emptySecretForm: SecretForm = {
  name: "",
  value: "",
  kind: "llm",
  provider: defaultLlmProvider,
  scope: "global",
  scopeRef: "",
  description: "",
  model: "",
  metadata: {},
  enabled: true
};

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
  const signature = String(Boolean(currentUser.pinConfigured)) + ":" + String(currentUser.totpEnabled);
  if (proof.current.signature !== signature) proof.current = { signature, revision: proof.current.revision + 1 };
  const revision = proof.current.revision;
  const current = useCallback(() => mounted.current && isOwner() && proof.current.revision === revision, [isOwner, revision]);
  const canOpen = () => pending.current === null;
  const read = useRef<AbortController | null>(null), confirmedKeys = useRef<SecretKeySummary[]>([]);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; read.current?.abort(); read.current = null; pending.current = null; }; }, []);
  const [snapshot, setSnapshot] = useState<ApiResponse<SecretKeysSnapshotResponse> | null>(null);
  const [status, setStatus] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "llm" | "custom">("all");
  const [enabledFilter, setEnabledFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [createForm, setCreateForm] = useState<SecretForm>(emptySecretForm);
  const createDialog = useSecretDialog<AuthForm>(current, revision, canOpen);
  const editDialog = useSecretDialog<{ key: SecretKeySummary; form: SecretForm; auth: AuthForm }>(current, revision, canOpen);
  const rotateDialog = useSecretDialog<{ key: SecretKeySummary; value: string; auth: AuthForm }>(current, revision, canOpen);
  const revealDialog = useSecretDialog<{ key: SecretKeySummary; auth: AuthForm; value?: string; revealedAt?: number }>(current, revision, canOpen);
  const removeDialog = useSecretDialog<{ key: SecretKeySummary; auth: AuthForm }>(current, revision, canOpen);
  const createAuthorization = createDialog.value;
  const exists = (draft: { key: SecretKeySummary } | null) => Boolean(draft && confirmedKeys.current.some(key => key.id === draft.key.id));
  const edit = exists(editDialog.value) ? editDialog.value : null;
  const rotate = exists(rotateDialog.value) ? rotateDialog.value : null;
  const remove = exists(removeDialog.value) ? removeDialog.value : null;
  useEffect(() => {
    const removed = Boolean(editDialog.value && !edit || rotateDialog.value && !rotate || removeDialog.value && !remove);
    if (editDialog.value && !edit) editDialog.close();
    if (rotateDialog.value && !rotate) rotateDialog.close();
    if (removeDialog.value && !remove) removeDialog.close();
    if (removed) setStatus("Secret action closed because the key no longer exists.");
  }, [editDialog.value, edit, rotateDialog.value, rotate, removeDialog.value, remove]);
  const [selectedId, setSelectedId] = useState("");
  const wizard = useRef(0), wizardEpoch = wizard.current;
  const operation = useOperationLock();

  const [readError, setReadError] = useState("");
  const [reading, setReading] = useState(false);
  const refresh = useCallback(async () => {
    if (!current() || read.current) return;
    const controller = new AbortController(); read.current = controller; setReading(true); setReadError("");
    try {
      const result = await api.get<SecretKeysSnapshotResponse>("snapshot", { signal: controller.signal });
      if (!current() || controller.signal.aborted || read.current !== controller) return;
      if (result.ok && validSecretSnapshot(result.payload)) { confirmedKeys.current = result.payload.keys; setSnapshot(result); }
      else setReadError("Encrypted-key metadata could not be loaded. Try again.");
    } catch { if (current() && read.current === controller && !controller.signal.aborted) setReadError("Encrypted-key metadata could not be loaded. Try again."); }
    finally { if (current() && read.current === controller) { read.current = null; setReading(false); } }
  }, [api, current]);
  useEffect(() => { void refresh(); return () => { read.current?.abort(); read.current = null; }; }, [refresh]);
  const scopeCatalog = useSecretScopeCatalog({ api: automationApi, active: createOpen || Boolean(edit), epoch: createOpen || createAuthorization ? "create:" + wizard.current : "edit:" + (edit?.dialogEpoch ?? "closed"), isOwner: current });
  const loadScopeProject = scopeCatalog.loadProject;

  const keys = snapshot?.payload?.keys ?? [];
  const filteredKeys = useMemo(() => filterSecretKeys(keys, query, kindFilter, enabledFilter), [enabledFilter, keys, kindFilter, query]);
  const visibleKeyId = reconcileVisibleSelection(filteredKeys, selectedId, (key) => key.id);
  const selectedRef = useRef(visibleKeyId); selectedRef.current = visibleKeyId;
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
  const draftReveal = revealDialog.value;
  const reveal = draftReveal && !secretRevealIsStale(draftReveal.key, keys.find(key => key.id === draftReveal.key.id)) && visibleKeyId === draftReveal.key.id ? draftReveal : null;
  useEffect(() => { if (draftReveal && !reveal) revealDialog.close(); }, [draftReveal, reveal]);
  useEffect(() => {
    if (reveal?.value === undefined) return;
    const instance = reveal;
    const timer = window.setTimeout(() => { if (revealDialog.sameDraft(instance)) { revealDialog.close(); setStatus("Revealed value hidden after 30 seconds"); } }, Math.max(0, 30_000 - (Date.now() - (instance.revealedAt ?? Date.now()))));
    return () => window.clearTimeout(timer);
  }, [reveal?.dialogEpoch, reveal?.revealedAt]);
  const closeWizard = () => { if (current() && wizard.current === wizardEpoch) { wizard.current++; setCreateOpen(false); setCreateForm(emptySecretForm); } };
  const knownKey = (key: SecretKeySummary) => confirmedKeys.current.some(row => row.id === key.id);
  async function mutate(name: string, valid: () => boolean, task: () => Promise<void>) {
    if (!current() || !valid()) return;
    await operation.run(name, async () => {
      if (!current() || !valid()) return;
      const token = {}; pending.current = token;
      read.current?.abort(); read.current = null; setReading(false);
      try { await task(); } catch { if (current() && valid()) setStatus("Secret operation failed. Try again."); }
      finally { if (pending.current === token) pending.current = null; }
    });
  }
  async function createKey() {
    if (!createAuthorization || !createDialog.sameDraft(createAuthorization) || !canSubmitAuth(createAuthorization, currentUser, false)) return;
    const draft = createAuthorization;
    await mutate("create-key", () => createDialog.current(draft), async () => {
      const result = await api.post("create-key", { ...formPayload(createForm), ...authPayload(draft) });
      if (!current() || !createDialog.current(draft)) return;
      setStatus(result.ok ? "Secret key saved" : "Secret key create failed. Try again.");
      if (result.ok) { setCreateForm(emptySecretForm); createDialog.close(); await refresh(); }
    });
  }
  async function saveEdit() {
    if (!edit || !editDialog.sameDraft(edit) || !canSubmitAuth(edit.auth, currentUser)) return;
    const draft = edit, valid = () => editDialog.current(draft) && knownKey(draft.key);
    await mutate("update-key", valid, async () => {
      const result = await api.post("update-key", { id: draft.key.id, ...formPayload({ ...draft.form, value: "" }, false), ...authPayload(draft.auth) });
      if (!current() || !valid()) return;
      setStatus(result.ok ? "Secret key updated" : "Secret key update failed. Try again.");
      if (result.ok) { editDialog.close(); await refresh(); }
    });
  }
  async function rotateKey() {
    if (!rotate || !rotateDialog.sameDraft(rotate) || !rotate.value || !canSubmitAuth(rotate.auth, currentUser)) return;
    const draft = rotate, valid = () => rotateDialog.current(draft) && knownKey(draft.key);
    await mutate("rotate-key", valid, async () => {
      const result = await api.post("rotate-key", { id: draft.key.id, value: draft.value, ...authPayload(draft.auth) });
      if (!current() || !valid()) return;
      setStatus(result.ok ? "Secret value rotated" : "Secret value rotation failed. Try again.");
      if (result.ok) { rotateDialog.close(); await refresh(); }
    });
  }
  async function revealKey() {
    if (!reveal || !revealDialog.sameDraft(reveal) || !canSubmitAuth(reveal.auth, currentUser)) return;
    const draft = reveal, valid = () => revealDialog.current(draft) && selectedRef.current === draft.key.id && !secretRevealIsStale(draft.key, confirmedKeys.current.find(key => key.id === draft.key.id));
    await mutate("reveal-key", valid, async () => {
      const result = await api.post<RevealSecretKeyResponse>("reveal-key", { id: draft.key.id, ...authPayload(draft.auth) });
      if (!current() || !valid()) return;
      if (result.ok && typeof result.payload?.value === "string" && (result.payload.key === undefined || validSecretKey(result.payload.key) && result.payload.key.id === draft.key.id && !secretRevealIsStale(draft.key, result.payload.key))) {
        revealDialog.change({ ...draft, auth: emptyAuth, value: result.payload.value, revealedAt: Date.now() }); setStatus("Secret revealed temporarily"); await refresh();
      } else { revealDialog.change({ ...draft, auth: emptyAuth }); setStatus("Secret reveal failed. Try again."); }
    });
  }
  async function deleteKey() {
    if (!remove || !removeDialog.sameDraft(remove) || !canSubmitAuth(remove.auth, currentUser)) return;
    const draft = remove, valid = () => removeDialog.current(draft) && knownKey(draft.key);
    await mutate("delete-key", valid, async () => {
      const result = await api.post("delete-key", { id: draft.key.id, ...authPayload(draft.auth) });
      if (!current() || !valid()) return;
      setStatus(result.ok ? "Secret key deleted" : "Secret key delete failed. Try again.");
      if (result.ok) { removeDialog.close(); setSelectedId(""); await refresh(); }
    });
  }
  if (!snapshot && !readError) return <LoadingState label="Loading secret keys" detail="Retrieving encrypted-key metadata. Secret values are never included in this response." />;
  if (!snapshot) return <EmptyState title="Secret Keys unavailable" description={readError} action={<button className="button" onClick={() => void refresh()} type="button">Retry</button>} />;

  return (
    <OperationBusyBoundary busy={operation.busy}><section aria-busy={operation.busy || undefined} className="secret-keys-workspace">
      <header className="program-inner-header"><div><strong>Secret Keys</strong><span>Encrypted credentials for LLM providers and custom integrations.</span></div><div className="inline-actions"><StatusText value={operation.activeOperation ? `Secret operation in progress: ${operation.activeOperation}` : status} /><button className="button" disabled={operation.busy || reading} onClick={() => void refresh()} type="button"><RefreshCcw size={14} aria-hidden />Refresh</button><button className="button button-primary" disabled={operation.busy} onClick={() => { if (current() && canOpen()) { wizard.current++; setCreateOpen(true); } }} type="button"><KeyRound size={14} aria-hidden />Add Key</button></div></header>
      {status ? <p role="status" aria-live="polite">{status}</p> : null}
      {readError ? <VisualAlert tone="warning" title="Metadata refresh failed" message={readError} /> : null}
      {readError ? <button className="button" disabled={reading || operation.busy} onClick={() => void refresh()} type="button">Retry metadata</button> : null}
      <div className="secret-keys-list-detail">
        <Panel title="Saved Keys">
          <div className="program-list-toolbar"><label className="program-search-field"><Search size={14} aria-hidden /><input aria-label="Search secret keys" onChange={(event) => setQuery(event.target.value)} placeholder="Search name, provider, scope, or model" type="search" value={query} /></label><select aria-label="Filter key type" onChange={(event) => setKindFilter(event.target.value as typeof kindFilter)} value={kindFilter}><option value="all">All types</option><option value="llm">LLM</option><option value="custom">Custom</option></select><select aria-label="Filter key status" onChange={(event) => setEnabledFilter(event.target.value as typeof enabledFilter)} value={enabledFilter}><option value="all">All statuses</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select></div>
          <DataTable label="Encrypted secret keys" columns={["Name", "Provider", "Scope", "Updated", "Actions"]} rows={filteredKeys.map((key) => [
            <button aria-current={selected?.id === key.id ? "true" : undefined} className="identity-user-link" onClick={() => { if (current() && knownKey(key)) setSelectedId(key.id); }} type="button"><strong>{key.name}</strong><small>{key.kind.toUpperCase()} · {key.enabled ? "Enabled" : "Disabled"}</small></button>,
            <span className="secret-provider-cell"><strong>{key.provider || "Custom"}</strong><small>{key.kind === "llm" ? providerRuntimeSupport(key.provider).label : "Custom integration"}</small></span>,
            <span className="secret-scope-cell"><strong>{key.scope}</strong>{key.scopeRef ? <small>{key.scopeRef}</small> : null}</span>,
            formatTime(key.updatedAtMs),
            <Menu icon={<MoreHorizontal size={15} aria-hidden />} iconOnly label={"Actions for " + key.name} options={[
              { id: "edit", label: "Edit metadata", icon: <Pencil size={14} aria-hidden />, onSelect: () => { if (!current() || !knownKey(key) || !canOpen()) return; setSelectedId(key.id); editDialog.open({ key, form: formFromKey(key), auth: emptyAuth }); } },
              { id: "rotate", label: "Rotate value", icon: <RefreshCcw size={14} aria-hidden />, onSelect: () => { if (!current() || !knownKey(key) || !canOpen()) return; setSelectedId(key.id); rotateDialog.open({ key, value: "", auth: emptyAuth }); } },
              { id: "reveal", label: "Reveal temporarily", icon: <Eye size={14} aria-hidden />, onSelect: () => { if (!current() || !knownKey(key) || !canOpen()) return; setSelectedId(key.id); revealDialog.open({ key, auth: emptyAuth }); } },
              { id: "delete", label: "Delete key", icon: <Trash2 size={14} aria-hidden />, danger: true, onSelect: () => { if (!current() || !knownKey(key) || !canOpen()) return; setSelectedId(key.id); removeDialog.open({ key, auth: emptyAuth }); } }
            ]} />
          ])} empty={keys.length ? "No keys match these filters." : "No secret keys have been added."} />
        </Panel>
        <Panel title="Key Detail">{selected ? <div className="secret-key-detail"><div className="secret-key-detail-heading"><span className="program-icon"><KeyRound size={18} aria-hidden /></span><span><strong>{selected.name}</strong><small>{selected.provider || "Custom integration"}</small></span><StatusBadge value={selected.enabled ? "Enabled" : "Disabled"} /></div><KeyValue rows={[["Kind", selected.kind], ["Provider", selected.provider || "-"], ["Runtime support", selected.kind === "llm" ? providerRuntimeSupport(selected.provider).detail : "Resolved by the owning integration"], ["Model", String(selected.metadata?.model ?? "Any compatible model")], ["Scope", selected.scopeRef ? selected.scope + ": " + selected.scopeRef : selected.scope], ["Description", selected.description || "-"], ["Created", formatTime(selected.createdAtMs)], ["Last rotated", formatTime(selected.lastRotatedAtMs)], ["Last revealed", formatTime(selected.lastRevealedAtMs)]]} /></div> : <EmptyState compact title="No key selected" description="Choose a saved key to inspect its metadata and runtime scope." />}</Panel>
      </div>

      {createOpen ? <Modal title="Add Secret Key" description="Describe the encrypted credential before authorizing its creation." onClose={() => closeWizard()}><SecretFormFields form={createForm} includeValue scopeOptions={scopeOptionsFor(createForm.scope)} scopeCatalog={scopeCatalog} onProjectChange={(projectId) => void loadScopeProject(projectId)} onCatalogRetry={() => void scopeCatalog.retryCatalog()} onProjectRetry={() => void scopeCatalog.retryProject()} onChange={form => { if (current() && wizard.current === wizardEpoch) setCreateForm(form); }} /><div className="modal-actions"><button className="button" onClick={() => closeWizard()} type="button">Cancel</button><button className="button button-primary" disabled={!canPrepareSecret(createForm)} onClick={() => { if (current() && wizard.current === wizardEpoch && canPrepareSecret(createForm)) { setCreateOpen(false); createDialog.open(emptyAuth); } }} type="button">Continue</button></div></Modal> : null}
      {createAuthorization ? <Modal title="Authorize New Key" description="Confirm your current password and configured PIN. Adding a key does not require 2FA." onClose={() => { if (createDialog.current(createAuthorization)) { createDialog.close(); setCreateForm(emptySecretForm); wizard.current++; } }}><AuthorizationFields auth={createAuthorization} currentUser={currentUser} requireTotp={false} onChange={createDialog.change} /><div className="modal-actions"><button className="button" onClick={() => { if (createDialog.current(createAuthorization)) { createDialog.close(); setCreateOpen(true); } }} type="button">Back</button><button className="button button-primary" disabled={!canSubmitAuth(createAuthorization, currentUser, false)} onClick={() => void createKey()} type="button">Save Key</button></div></Modal> : null}
      {edit ? <Modal title="Edit Key Metadata" description="Update how this key is identified and where runtime resolution may use it." onClose={() => editDialog.close()}><div className="secret-key-editor modal-secret-editor"><SecretFormFields form={edit.form} scopeOptions={scopeOptionsFor(edit.form.scope)} scopeCatalog={scopeCatalog} onProjectChange={(projectId) => void loadScopeProject(projectId)} onCatalogRetry={() => void scopeCatalog.retryCatalog()} onProjectRetry={() => void scopeCatalog.retryProject()} onChange={(form) => editDialog.change({ ...edit, form })} /><AuthorizationFields auth={edit.auth} currentUser={currentUser} onChange={(auth) => editDialog.change({ ...edit, auth })} /></div><div className="modal-actions"><button className="button" onClick={() => editDialog.close()} type="button">Cancel</button><button className="button button-primary" disabled={!canSubmitAuth(edit.auth, currentUser) || !edit.form.name.trim()} onClick={() => void saveEdit()} type="button">Save Changes</button></div></Modal> : null}
      {rotate ? <Modal title="Rotate Secret Value" description={"Replace the encrypted value for " + rotate.key.name + ". Existing metadata remains unchanged."} onClose={() => rotateDialog.close()}><div className="secret-modal-stack"><VisualAlert tone="warning" title="Rotation impact" message="New runtime requests use the replacement immediately. Existing in-flight work may still hold the prior credential." /><Field label="New secret value" required><input autoComplete="new-password" data-autofocus type="password" value={rotate.value} onChange={(event) => rotateDialog.change({ ...rotate, value: event.target.value })} /></Field><AuthorizationFields auth={rotate.auth} currentUser={currentUser} onChange={(auth) => rotateDialog.change({ ...rotate, auth })} /></div><div className="modal-actions"><button className="button" onClick={() => rotateDialog.close()} type="button">Cancel</button><button className="button button-primary" disabled={!rotate.value || !canSubmitAuth(rotate.auth, currentUser)} onClick={() => void rotateKey()} type="button">Rotate Value</button></div></Modal> : null}
      {reveal ? <Modal title="Reveal Secret" description={"Reveal " + reveal.key.name + " only long enough to inspect or copy it."} onClose={() => revealDialog.close()}>{reveal.value !== undefined ? <div className="secret-reveal-box"><code>{reveal.value}</code><ClipboardButton key={reveal.key.id} value={reveal.value} /><small>Automatically hidden after 30 seconds.</small></div> : <AuthorizationFields auth={reveal.auth} currentUser={currentUser} onChange={(auth) => revealDialog.change({ ...reveal, auth })} />}<div className="modal-actions"><button className="button" onClick={() => revealDialog.close()} type="button">Close</button>{reveal.value === undefined ? <button className="button button-primary" disabled={!canSubmitAuth(reveal.auth, currentUser)} onClick={() => void revealKey()} type="button">Reveal for 30 seconds</button> : null}</div></Modal> : null}
      {remove ? <Modal title="Delete Secret Key" description={"Permanently remove " + remove.key.name + " and its encrypted payload."} onClose={() => removeDialog.close()}><div className="secret-modal-stack"><VisualAlert tone="warning" title="Runtime impact" message="Flows or integrations referencing this key will no longer be able to resolve it." /><AuthorizationFields auth={remove.auth} currentUser={currentUser} onChange={(auth) => removeDialog.change({ ...remove, auth })} /></div><div className="modal-actions"><button className="button" onClick={() => removeDialog.close()} type="button">Cancel</button><button className="button button-danger" disabled={!canSubmitAuth(remove.auth, currentUser)} onClick={() => void deleteKey()} type="button">Delete Key</button></div></Modal> : null}
    </section></OperationBusyBoundary>
  );
}
type SecretDialog<T> = T & { dialogEpoch: number; proofRevision: number };
function useSecretDialog<T extends object>(isCurrent: () => boolean, proofRevision: number, canOpen: () => boolean) {
  const [state, setState] = useState<SecretDialog<T> | null>(null);
  const sequence = useRef(0), latest = useRef(state);
  const value = state?.proofRevision === proofRevision ? state : null; latest.current = value;
  const current = (candidate: SecretDialog<T> | null) => Boolean(isCurrent() && candidate && latest.current?.dialogEpoch === candidate.dialogEpoch && candidate.proofRevision === proofRevision);
  const publish = (next: SecretDialog<T> | null) => { latest.current = next; setState(next); };
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
  const llmProviderValue = isKnownLlmProvider(form.provider) ? form.provider : "Other";
  return (
    <div className="secret-form-sections">
      <div className="secret-form-section">
        <div className="field-row dense-fields secret-keys-form">
          <Field label="Name"><input value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} /></Field>
          {props.includeValue ? <Field label="Secret value"><input type="password" value={form.value} onChange={(event) => onChange({ ...form, value: event.target.value })} /></Field> : null}
          <Field label="Type"><select value={form.kind} onChange={(event) => onChange(changeKind(form, event.target.value as SecretForm["kind"]))}><option value="llm">LLM</option><option value="custom">Custom</option></select></Field>
          {form.kind === "llm" ? <Field label="Provider"><select value={llmProviderValue} onChange={(event) => onChange(changeLlmProvider(form, event.target.value))}>{llmProviders.map((provider) => <option key={provider} value={provider}>{provider}</option>)}</select></Field> : <Field label="Provider"><input placeholder="Internal service, vendor, app name" value={form.provider} onChange={(event) => onChange({ ...form, provider: event.target.value })} /></Field>}
          {form.kind === "llm" && llmProviderValue === "Other" ? <Field label="Custom provider"><input value={isKnownLlmProvider(form.provider) ? "" : form.provider} onChange={(event) => onChange({ ...form, provider: event.target.value })} /></Field> : null}
          {form.kind === "llm" ? <Field hint="Optional; leave blank to allow any compatible model." label="Model"><input placeholder="Model name" value={form.model} onChange={(event) => onChange({ ...form, model: event.target.value })} /></Field> : null}
        </div>
      </div>
      <div className="secret-form-section secondary">
        <div className="field-row dense-fields secret-keys-form">
          <Field label="Scope"><select value={form.scope} onChange={(event) => { const scope = event.target.value as SecretForm["scope"]; onChange({ ...form, scope, ...(scope === "global" ? { scopeRef: "" } : {}) }); }}><option value="global">Global</option><option value="domain">Domain</option><option value="flow">Flow</option><option value="custom">Custom</option></select></Field>
          {form.scope === "flow" && props.scopeCatalog ? <Field hint="Flows load only for the selected project." label="Project"><select disabled={props.scopeCatalog.loading && !props.scopeCatalog.projects.length} value={props.scopeCatalog.projectId} onChange={(event) => props.onProjectChange?.(event.target.value)}><option value="">Choose project</option>{props.scopeCatalog.projects.map((project) => <option key={project.id} value={project.id}>{project.label}</option>)}</select></Field> : null}
          <Field hint={form.scope === "global" ? "No object reference is needed for a global key." : "Choose a known reference or enter the exact owning object."} label={form.scope === "domain" ? "Domain" : form.scope === "flow" ? "Flow" : form.scope === "custom" ? "Scope object" : "Scope reference"}><input disabled={form.scope === "global" || (form.scope === "flow" && !props.scopeCatalog?.projectId)} list={form.scope === "global" ? undefined : "secret-scope-options-" + form.scope} placeholder={form.scope === "domain" ? "Choose or enter a domain" : form.scope === "flow" ? "Choose a project, then a Flow" : "Enter an object reference"} value={form.scope === "global" ? "" : form.scopeRef} onChange={(event) => onChange({ ...form, scopeRef: event.target.value })} />{form.scope !== "global" && props.scopeOptions?.length ? <datalist id={"secret-scope-options-" + form.scope}>{props.scopeOptions.map((option) => <option key={option} value={option} />)}</datalist> : null}</Field>
          <Field label="Description"><input value={form.description} onChange={(event) => onChange({ ...form, description: event.target.value })} /></Field>
          {props.scopeCatalog?.error ? <div className="inline-actions"><button className="button" disabled={props.scopeCatalog.loading} onClick={props.onCatalogRetry} type="button">Retry scope choices</button>{props.scopeCatalog.projectId ? <button className="button" disabled={props.scopeCatalog.loading} onClick={props.onProjectRetry} type="button">Retry project flows</button> : null}</div> : null}
          {props.scopeCatalog?.error ? <VisualAlert tone="warning" title="Scope catalog" message={props.scopeCatalog.error} /> : null}
          <label className="check-row"><input checked={form.enabled} onChange={(event) => onChange({ ...form, enabled: event.target.checked })} type="checkbox" />Enabled</label>
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
      <div className="secret-auth-heading"><strong>Authorization</strong><span>{requireTotp ? "Use your current security factors for this secret operation." : "Password and PIN are enough to add a new key."}</span></div>
      <div className="field-row dense-fields secret-auth-fields">
        <Field label="Your password"><input type="password" value={auth.password} onChange={(event) => onChange({ ...auth, password: event.target.value })} /></Field>
        {currentUser.pinConfigured ? <Field label="Your PIN"><input inputMode="numeric" value={auth.pin} onChange={(event) => onChange({ ...auth, pin: digits(event.target.value) })} /></Field> : null}
        {currentUser.totpEnabled && requireTotp ? <Field label="Your 2FA code"><input inputMode="numeric" value={auth.totp} onChange={(event) => onChange({ ...auth, totp: digits(event.target.value).slice(0, 6) })} /></Field> : null}
      </div>
    </div>
  );
}

function formFromKey(key: SecretKeySummary): SecretForm {
  return {
    name: key.name,
    value: "",
    kind: key.kind,
    provider: key.provider ?? (key.kind === "llm" ? defaultLlmProvider : ""),
    scope: key.scope,
    scopeRef: key.scopeRef ?? "",
    description: key.description ?? "",
    model: typeof key.metadata?.model === "string" ? key.metadata.model : "",
    metadata: key.metadata ?? {},
    enabled: key.enabled
  };
}

function formPayload(form: SecretForm, includeValue = true): JsonObject {
  const metadata: JsonObject = { ...form.metadata };
  if (form.model.trim()) metadata.model = form.model.trim();
  else delete metadata.model;
  return {
    name: form.name.trim(),
    ...(includeValue ? { value: form.value } : {}),
    kind: form.kind,
    ...(form.provider.trim() ? { provider: form.provider.trim() } : { provider: "" }),
    scope: form.scope,
    ...(form.scopeRef.trim() ? { scopeRef: form.scopeRef.trim() } : { scopeRef: "" }),
    ...(form.description.trim() ? { description: form.description.trim() } : { description: "" }),
    metadata,
    enabled: form.enabled
  };
}

function authPayload(auth: AuthForm): JsonObject {
  return {
    authorizationPassword: auth.password,
    ...(auth.pin ? { authorizationPin: auth.pin } : {}),
    ...(auth.totp ? { authorizationTotp: auth.totp } : {})
  };
}

function canPrepareSecret(form: SecretForm): boolean {
  return Boolean(form.name.trim() && form.value && providerReady(form));
}

export function canSubmitAuth(auth: AuthForm, currentUser: CurrentUser, requireTotp = true): boolean {
  return Boolean(auth.password && (!currentUser.pinConfigured || auth.pin.length >= 4) && (!requireTotp || !currentUser.totpEnabled || auth.totp.length === 6));
}

function providerReady(form: SecretForm): boolean {
  return form.kind !== "llm" || Boolean(form.provider.trim());
}

function changeKind(form: SecretForm, kind: SecretForm["kind"]): SecretForm {
  if (kind === "llm") return { ...form, kind, provider: form.provider.trim() || defaultLlmProvider };
  return { ...form, kind, provider: form.provider === defaultLlmProvider ? "" : form.provider };
}

function changeLlmProvider(form: SecretForm, provider: string): SecretForm {
  return { ...form, provider: provider === "Other" ? "" : provider };
}

function isKnownLlmProvider(value: string): boolean {
  return llmProviders.includes(value as (typeof llmProviders)[number]) && value !== "Other";
}
export function filterSecretKeys(keys: SecretKeySummary[], query: string, kind: "all" | "llm" | "custom", enabled: "all" | "enabled" | "disabled"): SecretKeySummary[] {
  const normalized = query.trim().toLocaleLowerCase();
  return keys.filter((key) => {
    if (kind !== "all" && key.kind !== kind) return false;
    if (enabled === "enabled" && !key.enabled) return false;
    if (enabled === "disabled" && key.enabled) return false;
    const model = typeof key.metadata?.model === "string" ? key.metadata.model : "";
    return !normalized || [key.name, key.provider ?? "", key.scope, key.scopeRef ?? "", model].some((value) => value.toLocaleLowerCase().includes(normalized));
  });
}

export function secretRevealIsStale(revealed: SecretKeySummary, current: SecretKeySummary | undefined): boolean {
  return !current || current.updatedAtMs !== revealed.updatedAtMs || current.lastRotatedAtMs !== revealed.lastRotatedAtMs;
}

export function providerRuntimeSupport(provider: string | undefined): { label: string; detail: string } {
  if (!provider) return { label: "Provider required", detail: "Set a provider before this LLM key can be resolved." };
  if (provider === "Ollama") return { label: "Local provider", detail: "Ollama normally uses a host-configured local endpoint and may not require an API key." };
  if (isKnownLlmProvider(provider)) return { label: "Built-in provider", detail: "FluxIQ can match this key to the built-in " + provider + " provider adapter." };
  return { label: "Custom adapter required", detail: "The host must register an adapter for this provider name before runtime resolution can use it." };
}
