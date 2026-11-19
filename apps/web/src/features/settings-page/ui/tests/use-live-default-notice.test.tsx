import React from "react";
import { act, create } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import type { SettingsKey, SettingsModelChoices } from "../../model";
import { useLiveDefaultNotice } from "../use-live-default-notice";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const key = (id: string, createdAtMs: number): SettingsKey => ({ id, name: id, kind: "llm", enabled: true, createdAtMs });
const NOTICE = { message: "Your default key was removed, and there is no other model key. Add one in Settings.", atMs: 5_000 };

function harness() {
  let said = "?";
  function Probe(props: { notice: SettingsModelChoices["defaultNotice"]; keys: SettingsKey[]; defaultKeyId: string | null }) {
    said = useLiveDefaultNotice(props.notice, props.keys, props.defaultKeyId);
    return null;
  }
  return { Probe, said: () => said };
}

describe("the lost-default note while a person works", () => {
  it("shows when first seen and clears the moment a key is added or the default changes", async () => {
    const { Probe, said } = harness();
    let view!: ReturnType<typeof create>;
    await act(async () => { view = create(<Probe notice={NOTICE} keys={[]} defaultKeyId={null} />); });
    expect(said()).toBe(NOTICE.message);
    // A key is added in this session: the engine still sends the note, and the page stops showing it.
    await act(async () => view.update(<Probe notice={NOTICE} keys={[key("new", 4_000)]} defaultKeyId="new" />));
    expect(said()).toBe("");
  });

  it("is empty when the engine sends none, and a newer note shows again", async () => {
    const { Probe, said } = harness();
    let view!: ReturnType<typeof create>;
    await act(async () => { view = create(<Probe notice={undefined} keys={[key("a", 1)]} defaultKeyId="a" />); });
    expect(said()).toBe("");
    await act(async () => view.update(<Probe notice={{ message: "Your default key was removed, so B is now the default.", atMs: 9_000 }} keys={[key("b", 2)]} defaultKeyId="b" />));
    expect(said()).toBe("Your default key was removed, so B is now the default.");
  });

  it("never shows a note about keys older than a key that exists now", async () => {
    const { Probe, said } = harness();
    await act(async () => { create(<Probe notice={NOTICE} keys={[key("later", 6_000)]} defaultKeyId="later" />); });
    expect(said()).toBe("");
  });
});
