"use client";

import { useEffect, useState } from "react";
import type { SettingsPort } from "../model";
import { readMyPreferences } from "./my-preferences";

export type StartingHumanness =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "ready"; value: number | null };

/** The person's starting humanness, read once. A failed read is "unavailable"; it is not retried in a loop. */
export function useStartingHumanness(port: SettingsPort): StartingHumanness {
  const [state, setState] = useState<StartingHumanness>({ status: "loading" });
  useEffect(() => {
    let live = true;
    void readMyPreferences(port).then((read) => {
      if (live) setState(read.ok ? { status: "ready", value: read.preferences.startingHumanness } : { status: "unavailable" });
    });
    return () => {
      live = false;
    };
  }, [port]);
  return state;
}
