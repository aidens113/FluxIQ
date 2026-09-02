import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useActiveRecordingDuration } from "./RecordingTimelineView";
import { RecordingActionDialogContent } from "./RecordingActionDialog";
import { useRecordingActionController } from "./useRecordingActionController";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function DurationHarness(props: { recording: { recordingId: string; startedAt: number; endedAt?: number } | null }) {
  return <span>{useActiveRecordingDuration(props.recording)}</span>;
}

function ControllerHarness(props: { input: Parameters<typeof useRecordingActionController>[0]; capture(controller: ReturnType<typeof useRecordingActionController>): void }) {
  props.capture(useRecordingActionController(props.input));
  return null;
}

afterEach(() => vi.useRealTimers());

describe("recording Phase 4 interactions", () => {
  it("ticks only for an active recording and cleans up its timer", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const clear = vi.spyOn(globalThis, "clearInterval");
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<DurationHarness recording={{ recordingId: "recording.live", startedAt: 8_000 }} />); });
    expect(renderer.root.findByType("span").children).toEqual(["2000"]);
    vi.setSystemTime(12_000);
    await act(async () => { vi.advanceTimersByTime(1_000); });
    expect(renderer.root.findByType("span").children).toEqual(["5000"]);
    await act(async () => renderer.update(<DurationHarness recording={{ recordingId: "recording.live", startedAt: 8_000, endedAt: 11_000 }} />));
    expect(renderer.root.findByType("span").children).toEqual(["3000"]);
    expect(clear).toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it("preserves modal values and disables duplicate submission while busy", async () => {
    const onSubmit = vi.fn();
    let html!: ReactTestRenderer;
    await act(async () => { html = create(<RecordingActionDialogContent busy error="Authorization failed" kind="note" pin="1234" value="Keep this note" onCancel={() => undefined} onPin={() => undefined} onSubmit={onSubmit} onValue={() => undefined} />); });
    expect(html.root.findByType("textarea").props.value).toBe("Keep this note");
    const submit = html.root.findAllByType("button").find((item) => item.children.includes("Working..."));
    expect(submit?.props.disabled).toBe(true);
    expect(html.root.findAllByProps({ role: "alert" }).some((item) => item.children.join("").includes("Authorization failed"))).toBe(true);
    await act(async () => html.unmount());
  });

  it("prevents duplicate mutations, preserves values after auth failure, retries, and refreshes only after success", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const update = vi.fn().mockImplementationOnce(() => pending.then(() => { throw new Error("Authorization failed"); })).mockResolvedValueOnce(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);
    let controller!: ReturnType<typeof useRecordingActionController>;
    let renderer!: ReactTestRenderer;
    const input = { selectedEntry: null, selectedRecording: { recordingId: "recording.one", metadata: { name: "Original" } }, onAppendRecordingMarker: vi.fn(), onAppendRecordingNote: vi.fn(), onDeleteRecording: vi.fn(), onFinalizeRecording: vi.fn(), onRefreshRecordings: refresh, onUpdateRecording: update };
    await act(async () => { renderer = create(<ControllerHarness input={input} capture={(next) => { controller = next; }} />); });
    await act(async () => { controller.open("rename"); });
    await act(async () => { controller.setValue("Preserved name"); controller.setPin("1111"); });
    let first!: Promise<void>;
    await act(async () => { first = controller.submit(); void controller.submit(); });
    expect(update).toHaveBeenCalledTimes(1);
    release();
    await act(async () => { await first; });
    expect(controller.error).toBe("Authorization failed");
    expect(controller.value).toBe("Preserved name");
    expect(controller.pin).toBe("1111");
    expect(refresh).not.toHaveBeenCalled();
    await act(async () => { controller.setPin("2222"); });
    await act(async () => { await controller.submit(); });
    expect(update).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(controller.kind).toBeNull();
    await act(async () => renderer.unmount());
  });
});
