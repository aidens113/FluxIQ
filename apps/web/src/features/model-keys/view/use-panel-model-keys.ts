"use client";

import { useMemo } from "react";
import { useProgramTransport } from "../../automation-studio/data/use-program-transport";
import { createPanelModelKeysPort, type PanelModelKeysPort } from "../port";

/** The panel's key port, made once for the Secret Keys program the page talks to. */
export function usePanelModelKeys(): PanelModelKeysPort {
  const secretKeys = useProgramTransport("secret-keys");
  return useMemo(() => createPanelModelKeysPort(secretKeys), [secretKeys]);
}
