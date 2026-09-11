"use client";

import { useEffect } from "react";
import { notifyGlobalAlert } from "./notifyGlobalAlert";
import { titleFromTone, toneFromMessage } from "./tone";

export function StatusText({ value }: { value: string }) {
  useEffect(() => {
    if (!value) return;
    const tone = toneFromMessage(value);
    notifyGlobalAlert({ tone, title: titleFromTone(tone), message: value });
  }, [value]);
  return null;
}
