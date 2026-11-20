"use client";

import type { ModelKeyHostAction } from "@fluxiq/ui-components";
import { useRouter } from "next/navigation";
import { ASSISTANT_MODEL_HREF, ModelKeyCardView, usePanelModelKeys } from "../../model-keys";

/** Home's status line for the person's AI key: the shared key card, small, with Core's real state and the one action beside it. */
export function HomeAiKey() {
  const modelKeys = usePanelModelKeys();
  const router = useRouter();
  function onAction(action: ModelKeyHostAction) {
    if (action === "change-model") router.push(ASSISTANT_MODEL_HREF);
    else if (action === "try-now") modelKeys.notify();
  }
  return (
    <section className="home-section home-ai-key" aria-labelledby="home-ai-key-heading">
      <div className="home-section-head">
        <h2 id="home-ai-key-heading">AI key</h2>
      </div>
      <ModelKeyCardView port={modelKeys} variant="compact" onAction={onAction} />
    </section>
  );
}
