"use client";

import { createModelKeyCard, defaultModelKeyProviders, type ModelKeyHostAction } from "@fluxiq/ui-components";
import "@fluxiq/ui-components/styles/model-access.css";
import { useEffect, useRef } from "react";
import type { PanelModelKeysPort } from "../port";

/**
 * The shared AI-key card (`@fluxiq/ui-components`) mounted in a React page. It reads Core's key state through
 * `port` when it appears and again whenever a key changes through that port, wherever on the page it changed.
 * `onAction` answers the card's host actions (Change model, Try now, How to update, Open FluxIQ).
 */
export function ModelKeyCardView(props: { port: PanelModelKeysPort; variant: "full" | "compact"; onAction(action: ModelKeyHostAction): void }) {
  const host = useRef<HTMLDivElement>(null);
  const onAction = useRef(props.onAction);
  onAction.current = props.onAction;
  const { port, variant } = props;
  useEffect(() => {
    const mount = host.current;
    if (!mount) return undefined;
    const card = createModelKeyCard({ port, variant, providers: defaultModelKeyProviders, onAction: (action) => onAction.current(action) });
    mount.replaceChildren(card.element);
    const stop = port.onChange(() => void card.refresh());
    return () => {
      stop();
      card.destroy();
    };
  }, [port, variant]);
  return <div className="panel-model-key-card" ref={host} />;
}
