"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { assistantModelPayload, newKeyPayload, removeKey, type NewKeyForm, type RemoveOutcome, type RemoveProof, type SettingsKey, type SettingsModelChoices, type SettingsPort } from "../model";

export type SettingsAllowance = { allowanceUsd: number; chosen: boolean; defaultUsd: number };

export type SettingsData = {
  loading: boolean;
  /** Plain words when the page could not read what it needs; empty otherwise. */
  loadError: string;
  keys: SettingsKey[];
  /** The server's answer, with `mayChoose` set from the hook's options (never from the server). */
  choices: SettingsModelChoices;
  allowance: SettingsAllowance | null;
  /** Each action answers with an error sentence, or "" when it worked. */
  setDefault(keyId: string): Promise<string>;
  saveAssistant(pick: { keyId: string; model: string }): Promise<string>;
  saveAllowance(usd: number | null): Promise<string>;
  addKey(form: NewKeyForm): Promise<string>;
  remove(keyId: string, proof?: RemoveProof): Promise<RemoveOutcome>;
};

const NO_CHOICES: SettingsModelChoices = { defaultKeyId: null, assistantKeyId: null, assistantModel: null, assistantProvider: null, assistantAllowanceUsd: null };
const COULD_NOT = "That did not work. Try again.";

/**
 * What the panel knows about the signed-in person. `mayChooseForWorkspace`:
 * whether they may change the workspace's default key and the assistant's key
 * and model (`mayChooseWorkspaceKeys` of their role's permissions); left out,
 * the page offers both and the server decides.
 */
export type SettingsDataOptions = { mayChooseForWorkspace?: boolean | undefined };

/** Reads what Settings shows and runs its changes through the port, reading again after each one. */
export function useSettingsData(port: SettingsPort, options: SettingsDataOptions = {}): SettingsData {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [keys, setKeys] = useState<SettingsKey[]>([]);
  const [answer, setAnswer] = useState<SettingsModelChoices>(NO_CHOICES);
  const mayChoose = options.mayChooseForWorkspace ?? true;
  // The server's answer never carries `mayChoose`; the panel's own fact is laid over it.
  const choices = useMemo<SettingsModelChoices>(() => ({ ...answer, mayChoose }), [answer, mayChoose]);
  const [allowance, setAllowance] = useState<SettingsAllowance | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const [snapshot, model, spend] = await Promise.all([
      port.call<{ keys?: SettingsKey[] }>("secret-keys", "snapshot"),
      port.call<SettingsModelChoices>("secret-keys", "get-assistant-model"),
      port.call<SettingsAllowance>("automation-studio", "get-panel-assistant-allowance")
    ]);
    if (!mounted.current) return;
    setLoading(false);
    if (!snapshot.ok || !snapshot.payload?.keys) {
      setLoadError("Your keys could not be read. Try again in a moment.");
      return;
    }
    setLoadError("");
    setKeys(snapshot.payload.keys);
    if (model.ok && model.payload) setAnswer(model.payload);
    if (spend.ok && spend.payload) setAllowance(spend.payload);
  }, [port]);
  useEffect(() => { void refresh(); }, [refresh]);

  const change = useCallback(async (run: () => Promise<{ ok: boolean; error?: string }>): Promise<string> => {
    const result = await run();
    if (result.ok) await refresh();
    return result.ok ? "" : result.error || COULD_NOT;
  }, [refresh]);

  return {
    loading, loadError, keys, choices, allowance,
    setDefault: (keyId) => change(() => port.call("secret-keys", "set-default-key", { id: keyId })),
    saveAssistant: (pick) => change(() => port.call("secret-keys", "set-assistant-model", assistantModelPayload(pick))),
    saveAllowance: (usd) => change(() => port.call("automation-studio", "set-panel-assistant-allowance", { allowanceUsd: usd })),
    addKey: (form) => change(() => port.call("secret-keys", "create-key", newKeyPayload(form))),
    remove: async (keyId, proof) => {
      const outcome = await removeKey(port, keyId, proof);
      if (outcome.kind === "removed") await refresh();
      return outcome;
    }
  };
}
