"use client";

import { Copy, Eye, KeyRound, MoreHorizontal, Pencil, RefreshCcw, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { RevealSecretKeyResponse, SecretKeysSnapshotResponse, SecretKeySummary } from "fluxiq/secret-keys";
import { useProgramApi, type ApiResponse, type JsonObject } from "../program-api";
import { DataTable, EmptyState, Field, KeyValue, LoadingState, Menu, Modal, Panel, StatusBadge, StatusText, VisualAlert } from "../shared-ui";
import type { CurrentUser } from "../types";
import { copyText, digits, formatTime } from "./shared";

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
  const [snapshot, setSnapshot] = useState<ApiResponse<SecretKeysSnapshotResponse> | null>(null);
  const [status, setStatus] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "llm" | "custom">("all");
  const [enabledFilter, setEnabledFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [copyStatus, setCopyStatus] = useState("");
  const [scopeCatalog, setScopeCatalog] = useState<{ domains: Array<{ id: string; label: string }>; projects: Array<{ id: string; label: string }>; flows: Array<{ id: string; label: string }>; projectId: string; loading: boolean; error: string }>({ domains: [], projects: [], flows: [], projectId: "", loading: false, error: "" });
  const [createForm, setCreateForm] = useState<SecretForm>(emptySecretForm);
  const [createAuthorization, setCreateAuthorization] = useState<AuthForm | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [edit, setEdit] = useState<{ key: SecretKeySummary; form: SecretForm; auth: AuthForm } | null>(null);
  const [rotate, setRotate] = useState<{ key: SecretKeySummary; value: string; auth: AuthForm } | null>(null);
  const [reveal, setReveal] = useState<{ key: SecretKeySummary; auth: AuthForm; value?: string } | null>(null);
  const [remove, setRemove] = useState<{ key: SecretKeySummary; auth: AuthForm } | null>(null);

  const refresh = useCallback(async () => setSnapshot(await api.get<SecretKeysSnapshotResponse>("snapshot")), [api]);
  useEffect(() => void refresh(), [refresh]);
  useEffect(() => {
    if (!createOpen && !edit) return;
    const controller = new AbortController();
    setScopeCatalog((current) => ({ ...current, loading: true, error: "" }));
    void Promise.all([
      fetch("/api/programs", { cache: "no-store", signal: controller.signal }).then((response) => response.json()),
      automationApi.get<{ projects: Array<{ id: string; name: string }> }>("projects", { signal: controller.signal })
    ]).then(([directory, projectsResult]) => {
      if (controller.signal.aborted) return;
      const domains = Array.isArray(directory?.domains) ? directory.domains.map((domain: any) => ({ id: String(domain.id ?? domain.domainId ?? ""), label: String(domain.title ?? domain.name ?? domain.id ?? "Domain") })).filter((item: { id: string }) => item.id) : [];
      const projects = (projectsResult.payload?.projects ?? []).map((project) => ({ id: project.id, label: project.name }));
      setScopeCatalog((current) => ({ ...current, domains, projects, loading: false, error: projectsResult.ok ? "" : projectsResult.error ?? "Flow projects could not be loaded." }));
    }).catch((error) => {
      if (!controller.signal.aborted) setScopeCatalog((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : "Scope objects could not be loaded." }));
    });
    return () => controller.abort();
  }, [automationApi, createOpen, edit?.key.id]);

  const keys = snapshot?.payload?.keys ?? [];
  const selected = keys.find((key) => key.id === selectedId) ?? keys[0] ?? null;
  const filteredKeys = useMemo(() => filterSecretKeys(keys, query, kindFilter, enabledFilter), [enabledFilter, keys, kindFilter, query]);
  const scopeOptionsFor = (scope: SecretForm["scope"]) => [...new Set([
    ...keys.filter((key) => key.scope === scope).map((key) => key.scopeRef).filter((value): value is string => Boolean(value)),
    ...(scope === "domain" ? scopeCatalog.domains.map((item) => item.id) : []),
    ...(scope === "flow" ? scopeCatalog.flows.map((item) => item.id) : [])
  ])];
  useEffect(() => {
    if (!reveal?.value) return;
    const timer = window.setTimeout(() => { setReveal(null); setCopyStatus(""); setStatus("Revealed value hidden after 30 seconds"); }, 30_000);
    return () => window.clearTimeout(timer);
  }, [reveal?.value]);
  useEffect(() => {
    if (reveal && selectedId && reveal.key.id !== selectedId) { setReveal(null); setCopyStatus(""); }
  }, [reveal, selectedId]);
  useEffect(() => {
    if (!reveal) return;
    const current = keys.find((key) => key.id === reveal.key.id);
    if (secretRevealIsStale(reveal.key, current)) { setReveal(null); setCopyStatus(""); setStatus("Reveal closed because the key changed"); }
  }, [keys, reveal]);

  async function loadScopeProject(projectId: string) {
    setScopeCatalog((current) => ({ ...current, projectId, flows: [], loading: Boolean(projectId), error: "" }));
    if (!projectId) return;
    const result = await automationApi.post<{ flows: Array<{ flowId: string; name: string }> }>("list-flow-summaries", { projectId });
    setScopeCatalog((current) => current.projectId !== projectId ? current : ({ ...current, loading: false, error: result.ok ? "" : result.error ?? "Flows could not be loaded.", flows: (result.payload?.flows ?? []).map((flow) => ({ id: flow.flowId, label: flow.name })) }));
  }

  async function createKey() {
    if (!createAuthorization) return;
    const result = await api.post("create-key", { ...formPayload(createForm), ...authPayload(createAuthorization) });
    setStatus(result.ok ? "Secret key saved" : result.error ?? "Secret key create failed");
    if (result.ok) {
      setCreateForm(emptySecretForm);
      setCreateAuthorization(null);
      await refresh();
    }
  }

  async function saveEdit() {
    if (!edit) return;
    const result = await api.post("update-key", { id: edit.key.id, ...formPayload({ ...edit.form, value: "" }, false), ...authPayload(edit.auth) });
    setStatus(result.ok ? "Secret key updated" : result.error ?? "Secret key update failed");
    if (result.ok) {
      setEdit(null);
      await refresh();
    }
  }

  async function rotateKey() {
    if (!rotate) return;
    const result = await api.post("rotate-key", { id: rotate.key.id, value: rotate.value, ...authPayload(rotate.auth) });
    setStatus(result.ok ? "Secret value rotated" : result.error ?? "Secret value rotation failed");
    if (result.ok) {
      setRotate(null);
      await refresh();
    }
  }

  async function revealKey() {
    if (!reveal) return;
    const result = await api.post<RevealSecretKeyResponse>("reveal-key", { id: reveal.key.id, ...authPayload(reveal.auth) });
    if (result.ok && result.payload) {
      setReveal({ ...reveal, value: result.payload.value });
      setStatus("Secret revealed temporarily");
      await refresh();
      return;
    }
    setReveal({ key: reveal.key, auth: emptyAuth });
    setStatus(result.error ?? "Secret reveal failed");
  }

  async function deleteKey() {
    if (!remove) return;
    const result = await api.post("delete-key", { id: remove.key.id, ...authPayload(remove.auth) });
    setStatus(result.ok ? "Secret key deleted" : result.error ?? "Secret key delete failed");
    if (result.ok) {
      setRemove(null);
      setSelectedId("");
      await refresh();
    }
  }

  if (!snapshot) return <LoadingState label="Loading secret keys" detail="Retrieving encrypted-key metadata. Secret values are never included in this response." />;
  if (!snapshot.ok) return <EmptyState title="Secret Keys unavailable" description={snapshot.error ?? "Encrypted-key metadata could not be loaded."} action={<button className="button" onClick={() => void refresh()} type="button">Retry</button>} />;

  return (
    <section className="secret-keys-workspace">
      <header className="program-inner-header"><div><strong>Secret Keys</strong><span>Encrypted credentials for LLM providers and custom integrations.</span></div><div className="inline-actions"><StatusText value={status} /><button className="button" onClick={() => void refresh()} type="button"><RefreshCcw size={14} aria-hidden />Refresh</button><button className="button button-primary" onClick={() => setCreateOpen(true)} type="button"><KeyRound size={14} aria-hidden />Add Key</button></div></header>
      <div className="secret-keys-list-detail">
        <Panel title="Saved Keys">
          <div className="program-list-toolbar"><label className="program-search-field"><Search size={14} aria-hidden /><input aria-label="Search secret keys" onChange={(event) => setQuery(event.target.value)} placeholder="Search name, provider, scope, or model" type="search" value={query} /></label><select aria-label="Filter key type" onChange={(event) => setKindFilter(event.target.value as typeof kindFilter)} value={kindFilter}><option value="all">All types</option><option value="llm">LLM</option><option value="custom">Custom</option></select><select aria-label="Filter key status" onChange={(event) => setEnabledFilter(event.target.value as typeof enabledFilter)} value={enabledFilter}><option value="all">All statuses</option><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select></div>
          <DataTable columns={["Name", "Provider", "Scope", "Updated", ""]} rows={filteredKeys.map((key) => [
            <button aria-current={selected?.id === key.id ? "true" : undefined} className="identity-user-link" onClick={() => setSelectedId(key.id)} type="button"><strong>{key.name}</strong><small>{key.kind.toUpperCase()} · {key.enabled ? "Enabled" : "Disabled"}</small></button>,
            <span className="secret-provider-cell"><strong>{key.provider || "Custom"}</strong><small>{key.kind === "llm" ? providerRuntimeSupport(key.provider).label : "Custom integration"}</small></span>,
            <span className="secret-scope-cell"><strong>{key.scope}</strong>{key.scopeRef ? <small>{key.scopeRef}</small> : null}</span>,
            formatTime(key.updatedAtMs),
            <Menu icon={<MoreHorizontal size={15} aria-hidden />} iconOnly label={"Actions for " + key.name} options={[
              { id: "edit", label: "Edit metadata", icon: <Pencil size={14} aria-hidden />, onSelect: () => { setSelectedId(key.id); setEdit({ key, form: formFromKey(key), auth: emptyAuth }); } },
              { id: "rotate", label: "Rotate value", icon: <RefreshCcw size={14} aria-hidden />, onSelect: () => { setSelectedId(key.id); setRotate({ key, value: "", auth: emptyAuth }); } },
              { id: "reveal", label: "Reveal temporarily", icon: <Eye size={14} aria-hidden />, onSelect: () => { setSelectedId(key.id); setReveal({ key, auth: emptyAuth }); setCopyStatus(""); } },
              { id: "delete", label: "Delete key", icon: <Trash2 size={14} aria-hidden />, danger: true, onSelect: () => { setSelectedId(key.id); setRemove({ key, auth: emptyAuth }); } }
            ]} />
          ])} empty={keys.length ? "No keys match these filters." : "No secret keys have been added."} />
        </Panel>
        <Panel title="Key Detail">{selected ? <div className="secret-key-detail"><div className="secret-key-detail-heading"><span className="program-icon"><KeyRound size={18} aria-hidden /></span><span><strong>{selected.name}</strong><small>{selected.provider || "Custom integration"}</small></span><StatusBadge value={selected.enabled ? "Enabled" : "Disabled"} /></div><KeyValue rows={[["Kind", selected.kind], ["Provider", selected.provider || "-"], ["Runtime support", selected.kind === "llm" ? providerRuntimeSupport(selected.provider).detail : "Resolved by the owning integration"], ["Model", String(selected.metadata?.model ?? "Any compatible model")], ["Scope", selected.scopeRef ? selected.scope + ": " + selected.scopeRef : selected.scope], ["Description", selected.description || "-"], ["Created", formatTime(selected.createdAtMs)], ["Last rotated", formatTime(selected.lastRotatedAtMs)], ["Last revealed", formatTime(selected.lastRevealedAtMs)]]} /></div> : <EmptyState compact title="No key selected" description="Choose a saved key to inspect its metadata and runtime scope." />}</Panel>
      </div>

      {createOpen ? <Modal title="Add Secret Key" description="Describe the encrypted credential before authorizing its creation." onClose={() => setCreateOpen(false)}><SecretFormFields form={createForm} includeValue scopeOptions={scopeOptionsFor(createForm.scope)} scopeCatalog={scopeCatalog} onProjectChange={(projectId) => void loadScopeProject(projectId)} onChange={setCreateForm} /><div className="modal-actions"><button className="button" onClick={() => setCreateOpen(false)} type="button">Cancel</button><button className="button button-primary" disabled={!canPrepareSecret(createForm)} onClick={() => { setCreateOpen(false); setCreateAuthorization(emptyAuth); }} type="button">Continue</button></div></Modal> : null}
      {createAuthorization ? <Modal title="Authorize New Key" description="Confirm your current password and configured PIN. Adding a key does not require 2FA." onClose={() => setCreateAuthorization(null)}><AuthorizationFields auth={createAuthorization} currentUser={currentUser} requireTotp={false} onChange={setCreateAuthorization} /><div className="modal-actions"><button className="button" onClick={() => { setCreateAuthorization(null); setCreateOpen(true); }} type="button">Back</button><button className="button button-primary" disabled={!canSubmitAuth(createAuthorization, currentUser, false)} onClick={() => void createKey()} type="button">Save Key</button></div></Modal> : null}
      {edit ? <Modal title="Edit Key Metadata" description="Update how this key is identified and where runtime resolution may use it." onClose={() => setEdit(null)}><div className="secret-key-editor modal-secret-editor"><SecretFormFields form={edit.form} scopeOptions={scopeOptionsFor(edit.form.scope)} scopeCatalog={scopeCatalog} onProjectChange={(projectId) => void loadScopeProject(projectId)} onChange={(form) => setEdit({ ...edit, form })} /><AuthorizationFields auth={edit.auth} currentUser={currentUser} onChange={(auth) => setEdit({ ...edit, auth })} /></div><div className="modal-actions"><button className="button" onClick={() => setEdit(null)} type="button">Cancel</button><button className="button button-primary" disabled={!canSubmitAuth(edit.auth, currentUser) || !edit.form.name.trim()} onClick={() => void saveEdit()} type="button">Save Changes</button></div></Modal> : null}
      {rotate ? <Modal title="Rotate Secret Value" description={"Replace the encrypted value for " + rotate.key.name + ". Existing metadata remains unchanged."} onClose={() => setRotate(null)}><div className="secret-modal-stack"><VisualAlert tone="warning" title="Rotation impact" message="New runtime requests use the replacement immediately. Existing in-flight work may still hold the prior credential." /><Field label="New secret value" required><input autoComplete="new-password" data-autofocus type="password" value={rotate.value} onChange={(event) => setRotate({ ...rotate, value: event.target.value })} /></Field><AuthorizationFields auth={rotate.auth} currentUser={currentUser} onChange={(auth) => setRotate({ ...rotate, auth })} /></div><div className="modal-actions"><button className="button" onClick={() => setRotate(null)} type="button">Cancel</button><button className="button button-primary" disabled={!rotate.value || !canSubmitAuth(rotate.auth, currentUser)} onClick={() => void rotateKey()} type="button">Rotate Value</button></div></Modal> : null}
      {reveal ? <Modal title="Reveal Secret" description={"Reveal " + reveal.key.name + " only long enough to inspect or copy it."} onClose={() => { setReveal(null); setCopyStatus(""); }}>{reveal.value ? <div className="secret-reveal-box"><code>{reveal.value}</code><button className="button" onClick={() => { void copyText(reveal.value ?? ""); setCopyStatus("Copied"); }} type="button"><Copy size={14} aria-hidden />{copyStatus || "Copy"}</button><small>Automatically hidden after 30 seconds.</small></div> : <AuthorizationFields auth={reveal.auth} currentUser={currentUser} onChange={(auth) => setReveal({ ...reveal, auth })} />}<div className="modal-actions"><button className="button" onClick={() => { setReveal(null); setCopyStatus(""); }} type="button">Close</button>{!reveal.value ? <button className="button button-primary" disabled={!canSubmitAuth(reveal.auth, currentUser)} onClick={() => void revealKey()} type="button">Reveal for 30 seconds</button> : null}</div></Modal> : null}
      {remove ? <Modal title="Delete Secret Key" description={"Permanently remove " + remove.key.name + " and its encrypted payload."} onClose={() => setRemove(null)}><div className="secret-modal-stack"><VisualAlert tone="warning" title="Runtime impact" message="Flows or integrations referencing this key will no longer be able to resolve it." /><AuthorizationFields auth={remove.auth} currentUser={currentUser} onChange={(auth) => setRemove({ ...remove, auth })} /></div><div className="modal-actions"><button className="button" onClick={() => setRemove(null)} type="button">Cancel</button><button className="button button-danger" disabled={!canSubmitAuth(remove.auth, currentUser)} onClick={() => void deleteKey()} type="button">Delete Key</button></div></Modal> : null}
    </section>
  );
}
function SecretFormFields(props: { form: SecretForm; includeValue?: boolean; scopeOptions?: string[]; scopeCatalog?: { domains: Array<{ id: string; label: string }>; projects: Array<{ id: string; label: string }>; flows: Array<{ id: string; label: string }>; projectId: string; loading: boolean; error: string }; onProjectChange?(projectId: string): void; onChange(form: SecretForm): void }) {
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