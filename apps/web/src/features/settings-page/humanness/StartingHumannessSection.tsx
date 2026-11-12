"use client";

import "@fluxiq/ui-components/styles/chat.css";
import { createHumannessControl } from "@fluxiq/ui-components";
import { useEffect, useRef } from "react";
import type { SettingsPort } from "../model";
import { saveStartingHumanness } from "./my-preferences";
import { useStartingHumanness } from "./use-starting-humanness";

/**
 * The person's own starting humanness: what a task or Flow with no level of its own uses.
 * The shared control saves it itself (`commit`); clearing sets none (null), which runs at 0.
 */
export function StartingHumannessSection(props: { port: SettingsPort }) {
  const starting = useStartingHumanness(props.port);
  return (
    <section aria-labelledby="settings-starting-humanness">
      <h2 id="settings-starting-humanness">Starting humanness</h2>
      <p>The level a task or Flow uses when it has none of its own. 0 is fastest, with no added waits; higher looks more like a person.</p>
      {starting.status === "loading" ? <p role="status">Loading your starting humanness...</p> : null}
      {starting.status === "unavailable" ? <p role="status">Your starting humanness is not available right now.</p> : null}
      {starting.status === "ready" ? <StartingControl port={props.port} value={starting.value} /> : null}
    </section>
  );
}

function StartingControl(props: { port: SettingsPort; value: number | null }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const port = useRef(props.port);
  port.current = props.port;
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const control = createHumannessControl({
      level: props.value === null ? { starting: 0 } : { own: props.value, starting: 0 },
      label: "Starting humanness",
      settleMs: 300,
      commit: async (humanness) => {
        const failure = await saveStartingHumanness(port.current, humanness);
        return failure ? { ok: false, sentence: failure } : { ok: true, value: humanness === null ? {} : { humanness } };
      }
    });
    host.append(control.element);
    return () => {
      control.dispose();
      control.element.remove();
    };
    // Mounted once with the value read; the control holds what it saves after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div ref={hostRef} />;
}
