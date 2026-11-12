"use client";

import { useCallback } from "react";
import { useProgramTransport } from "../../automation-studio/data/use-program-transport";
import { useResource } from "../../home/data";
import { loadKeyRows } from "../data";
import { SectionBody } from "../state";
import { KeysList } from "./KeysList";

/** The model-provider keys: names and state only. Adding, replacing, removing and unlocking are on /security/keys. */
export function KeysSection() {
  const secretKeys = useProgramTransport("secret-keys");
  const keys = useResource(useCallback((signal: AbortSignal) => loadKeyRows(secretKeys, signal), [secretKeys]));
  const now = Date.now();
  return (
    <section className="security-section" aria-labelledby="security-keys">
      <h2 id="security-keys">Keys</h2>
      <SectionBody resource={keys} noun="your keys">{(rows) => <KeysList rows={rows} now={now} />}</SectionBody>
      <p className="security-note"><a href="/security/keys">Manage keys</a>: add, replace, remove, scope, lock and unlock every stored key.</p>
    </section>
  );
}
