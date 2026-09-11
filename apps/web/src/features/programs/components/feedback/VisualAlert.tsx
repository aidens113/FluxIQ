"use client";

import { InlineNotice } from "./InlineNotice";
import type { AlertTone } from "./tone";

export function VisualAlert(props: { tone: AlertTone; title?: string; message: string }) {
  return <InlineNotice {...props} />;
}
