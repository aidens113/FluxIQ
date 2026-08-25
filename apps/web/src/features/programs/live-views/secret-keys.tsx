"use client";

import { Copy, Eye, KeyRound, Pencil, RefreshCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { RevealSecretKeyResponse, SecretKeysSnapshotResponse, SecretKeySummary } from "fluxiq/secret-keys";
import { useProgramApi, type ApiResponse, type JsonObject } from "../program-api";
import { DataTable, Field, KeyValue, Modal, Panel, StatusBadge, StatusText } from "../shared-ui";
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
  enabled: true
};

export function SecretKeysLive({ currentUser }: { currentUser: CurrentUser }) {
  const api = useProgramApi("secret-keys");
  const [snapshot, setSnapshot] = useState<ApiResponse<SecretKeysSnapshotResponse> | null>(null);
  const [status, setStatus] = useState("");
  const [createForm, setCreateForm] = useState<SecretForm>(emptySecretForm);
  const [createAuthorization, setCreateAuthorization] = useState<AuthForm | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [edit, setEdit] = useState<{ key: SecretKeySummary; form: SecretForm; auth: AuthForm } | null>(null);
  const [rotate, setRotate] = useState<{ key: SecretKeySummary; value: string; auth: AuthForm } | null>(null);
  const [reveal, setReveal] = useState<{ key: SecretKeySummary; auth: AuthForm; value?: string } | null>(null);
  const [remove, setRemove] = useState<{ key: SecretKeySummary; auth: AuthForm } | null>(null);

  const refresh = useCallback(async () => setSnapshot(await api.get<SecretKeysSnapshotResponse>("snapshot")), [api]);
  useEffect(() => void refresh(), [refresh]);

  const keys = snapshot?.payload?.keys ?? [];
  const selected = keys.find((key) => key.id === selectedId) ?? keys[0] ?? null;
  const llmKeys = keys.filter((key) => key.kind === "llm").length;
  const enabledKeys = keys.filter((key) => key.enabled).length;
  const groupedProviders = useMemo(() => {
    const providers = new Set(keys.map((key) => key.provider).filter(Boolean));
    return providers.size ? [...providers].sort().join(", ") : "None";
  }, [keys]);

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

  return (
    <section className="program-workspace-grid secret-keys-workspace">
      <Panel title="Secret Keys" action={<button className="button" onClick={refresh} type="button"><RefreshCcw size={15} aria-hidden />Refresh</button>}>
        <div className="secret-key-hero">
          <div className="summary-strip secret-key-summary-strip">
            <div><strong>{keys.length}</strong><span>Total keys</span></div>
            <div><strong>{enabledKeys}</strong><span>Enabled</span></div>
            <div><strong>{llmKeys}</strong><span>LLM keys</span></div>
            <div><strong>{groupedProviders}</strong><span>Providers</span></div>
          </div>
        </div>
      </Panel>

      <Panel title="Add Key" action={<button className="button button-primary" disabled={!canPrepareSecret(createForm)} onClick={() => setCreateAuthorization(emptyAuth)} type="button"><KeyRound size={15} aria-hidden />Add Key</button>}>
        <div className="secret-key-editor">
          <SecretFormFields form={createForm} includeValue onChange={setCreateForm} />
        </div>
      </Panel>

      <Panel title="Saved Keys">
        <DataTable columns={["Name", "Provider", "Scope", "Updated", "Actions"]} rows={keys.map((key) => [
          <button className={`link-button secret-key-name ${selected?.id === key.id ? "selected" : ""}`} onClick={() => setSelectedId(key.id)} type="button">
            <strong>{key.name}</strong>
            <small><StatusBadge value={key.kind.toUpperCase()} />{key.enabled ? "Enabled" : "Disabled"}</small>
          </button>,
          <span className="secret-provider-cell"><strong>{key.provider || "Custom"}</strong><small>{key.kind === "llm" ? "LLM provider" : "Custom secret"}</small></span>,
          <span className="secret-scope-cell"><strong>{key.scope}</strong>{key.scopeRef ? <small>{key.scopeRef}</small> : null}</span>,
          <span className="secret-time-cell">{formatTime(key.updatedAtMs)}</span>,
          <div className="inline-actions secret-row-actions">
            <button className="button" onClick={() => setEdit({ key, form: formFromKey(key), auth: emptyAuth })} type="button"><Pencil size={14} aria-hidden />Edit</button>
            <button className="button" onClick={() => setRotate({ key, value: "", auth: emptyAuth })} type="button"><RefreshCcw size={14} aria-hidden />Rotate</button>
            <button className="button" onClick={() => setReveal({ key, auth: emptyAuth })} type="button"><Eye size={14} aria-hidden />Reveal</button>
            <button className="button danger-button" onClick={() => setRemove({ key, auth: emptyAuth })} type="button"><Trash2 size={14} aria-hidden />Delete</button>
          </div>
        ])} empty="No secret keys have been added yet." />
      </Panel>

      <Panel title="Key Detail">
        {selected ? <div className="secret-key-detail">
          <div className="secret-key-detail-heading">
            <span className="program-icon"><KeyRound size={18} aria-hidden /></span>
            <span><strong>{selected.name}</strong><small>{selected.provider ?? "No provider"}</small></span>
            <StatusBadge value={selected.enabled ? "Enabled" : "Disabled"} />
          </div>
          <KeyValue rows={[
            ["ID", selected.id],
            ["Kind", selected.kind],
            ["Scope", selected.scopeRef ? `${selected.scope}: ${selected.scopeRef}` : selected.scope],
            ["Created", formatTime(selected.createdAtMs)],
            ["Last rotated", formatTime(selected.lastRotatedAtMs)],
            ["Last revealed", formatTime(selected.lastRevealedAtMs)]
          ]} />
        </div> : <p className="muted-text">Select a key row to inspect its metadata.</p>}
      </Panel>

      {createAuthorization ? <Modal title="Authorize New Key" onClose={() => setCreateAuthorization(null)}>
        <div className="secret-modal-stack">
          <p className="muted-text">Confirm your current credentials to encrypt and save this key.</p>
          <AuthorizationFields auth={createAuthorization} currentUser={currentUser} requireTotp={false} onChange={setCreateAuthorization} />
        </div>
        <div className="modal-actions"><button className="button" onClick={() => setCreateAuthorization(null)} type="button">Cancel</button><button className="button button-primary" disabled={!canSubmitAuth(createAuthorization, currentUser, false)} onClick={createKey} type="button">Save Key</button></div>
      </Modal> : null}

      {edit ? <Modal title="Edit Key" onClose={() => setEdit(null)}>
        <div className="secret-key-editor modal-secret-editor">
          <SecretFormFields form={edit.form} onChange={(form) => setEdit({ ...edit, form })} />
          <AuthorizationFields auth={edit.auth} currentUser={currentUser} onChange={(auth) => setEdit({ ...edit, auth })} />
        </div>
        <div className="modal-actions"><button className="button" onClick={() => setEdit(null)} type="button">Cancel</button><button className="button button-primary" disabled={!canSubmitAuth(edit.auth, currentUser) || !edit.form.name.trim()} onClick={saveEdit} type="button">Save Changes</button></div>
      </Modal> : null}

      {rotate ? <Modal title="Rotate Secret Value" onClose={() => setRotate(null)}>
        <div className="secret-modal-stack">
          <p className="muted-text">Replace the encrypted value for {rotate.key.name}. Existing metadata stays intact.</p>
          <Field label="New secret value"><input type="password" value={rotate.value} onChange={(event) => setRotate({ ...rotate, value: event.target.value })} /></Field>
          <AuthorizationFields auth={rotate.auth} currentUser={currentUser} onChange={(auth) => setRotate({ ...rotate, auth })} />
        </div>
        <div className="modal-actions"><button className="button" onClick={() => setRotate(null)} type="button">Cancel</button><button className="button button-primary" disabled={!rotate.value || !canSubmitAuth(rotate.auth, currentUser)} onClick={rotateKey} type="button">Rotate</button></div>
      </Modal> : null}

      {reveal ? <Modal title="Reveal Secret" onClose={() => setReveal(null)}>
        {reveal.value ? <div className="secret-reveal-box"><code>{reveal.value}</code><button className="button" onClick={() => copyText(reveal.value ?? "")} type="button"><Copy size={14} aria-hidden />Copy</button></div> : <div className="secret-modal-stack"><p className="muted-text">Reveal {reveal.key.name} only long enough to copy or inspect it.</p><AuthorizationFields auth={reveal.auth} currentUser={currentUser} onChange={(auth) => setReveal({ ...reveal, auth })} /></div>}
        <div className="modal-actions"><button className="button" onClick={() => setReveal(null)} type="button">Close</button>{!reveal.value ? <button className="button button-primary" disabled={!canSubmitAuth(reveal.auth, currentUser)} onClick={revealKey} type="button">Reveal</button> : null}</div>
      </Modal> : null}

      {remove ? <Modal title="Delete Key" onClose={() => setRemove(null)}>
        <div className="secret-modal-stack">
          <p className="muted-text">Delete {remove.key.name}. This removes the encrypted payload and its metadata.</p>
          <AuthorizationFields auth={remove.auth} currentUser={currentUser} onChange={(auth) => setRemove({ ...remove, auth })} />
        </div>
        <div className="modal-actions"><button className="button" onClick={() => setRemove(null)} type="button">Cancel</button><button className="button button-primary danger-primary" disabled={!canSubmitAuth(remove.auth, currentUser)} onClick={deleteKey} type="button">Delete</button></div>
      </Modal> : null}

      <StatusText value={status} />
    </section>
  );
}

function SecretFormFields(props: { form: SecretForm; includeValue?: boolean; onChange(form: SecretForm): void }) {
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
        </div>
      </div>
      <div className="secret-form-section secondary">
        <div className="field-row dense-fields secret-keys-form">
          <Field label="Scope"><select value={form.scope} onChange={(event) => onChange({ ...form, scope: event.target.value as SecretForm["scope"] })}><option value="global">Global</option><option value="domain">Domain</option><option value="flow">Flow</option><option value="custom">Custom</option></select></Field>
          <Field label="Scope reference"><input value={form.scopeRef} onChange={(event) => onChange({ ...form, scopeRef: event.target.value })} /></Field>
          <Field label="Description"><input value={form.description} onChange={(event) => onChange({ ...form, description: event.target.value })} /></Field>
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
    enabled: key.enabled
  };
}

function formPayload(form: SecretForm, includeValue = true): JsonObject {
  return {
    name: form.name.trim(),
    ...(includeValue ? { value: form.value } : {}),
    kind: form.kind,
    ...(form.provider.trim() ? { provider: form.provider.trim() } : { provider: "" }),
    scope: form.scope,
    ...(form.scopeRef.trim() ? { scopeRef: form.scopeRef.trim() } : { scopeRef: "" }),
    ...(form.description.trim() ? { description: form.description.trim() } : { description: "" }),
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

function canSubmitAuth(auth: AuthForm, currentUser: CurrentUser, requireTotp = true): boolean {
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