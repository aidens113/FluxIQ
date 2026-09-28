"use client";

import { InlineNotice } from "../../programs/shared-ui";

export const AUTOMATION_IDENTITY_ACCESS_HREF = "/programs/identity-access";

/**
 * Shown where a PIN is genuinely required - a delete - and the account has none
 * configured. Before this, the submit button simply sat disabled behind a
 * sentence naming another program, with no way to reach it: the person had to
 * leave Automation Studio, find Identity and Access themselves, and come back.
 * A dead end is not a safety measure, so the notice carries the link.
 */
export function AutomationPinRequirementNotice(props: { pinConfigured: boolean }) {
  if (props.pinConfigured) return null;
  return (
    <InlineNotice
      action={<a className="button" href={AUTOMATION_IDENTITY_ACCESS_HREF}>Set up a PIN</a>}
      message="Deleting needs your security PIN, and this account has not set one yet. Set one up in Account and access, then come back here."
      title="PIN not configured"
      tone="error"
    />
  );
}
