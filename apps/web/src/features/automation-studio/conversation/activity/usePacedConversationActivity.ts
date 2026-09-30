"use client";

// Core's latest event, as the paced status a person reads (`pacer.ts`).
//
// One pacer per project, kept across renders, so the headline and detail
// change in place rather than being rebuilt from each poll's answer.

import { useEffect, useRef, useState } from "react";
import type { ConversationActivity } from "./contracts";
import { ConversationActivityPacer, type ConversationActivityDisplay } from "./pacer";

export function usePacedConversationActivity(current: ConversationActivity | null, projectId: string | null): ConversationActivityDisplay | null {
  const [display, setDisplay] = useState<ConversationActivityDisplay | null>(null);
  const pacerRef = useRef<ConversationActivityPacer | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const pacer = new ConversationActivityPacer(
      {
        now: () => Date.now(),
        setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
        clearTimeout: (timer) => window.clearTimeout(timer as number)
      },
      setDisplay
    );
    pacerRef.current = pacer;
    setDisplay(null);
    return () => {
      pacer.dispose();
      if (pacerRef.current === pacer) pacerRef.current = null;
    };
  }, [projectId]);

  useEffect(() => {
    if (current) pacerRef.current?.accept(current);
  }, [current]);

  return display;
}
