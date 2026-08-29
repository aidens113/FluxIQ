import { resizeAutomationMainSplitRatios } from "../layout/mutations";
import { clampNumber } from "../layout/sizing";

export type AutomationResizeSession = {
  current(): number;
  move(pointer: number): number;
  finish(): number;
  cancel(): void;
};

export function createAutomationResizeSession(options: {
  startPointer: number;
  startValue: number;
  direction?: 1 | -1;
  min: number;
  max: number;
  onTransient(value: number): void;
  onCommit(value: number): void;
  onCancel?(): void;
}): AutomationResizeSession {
  let value = options.startValue;
  let finished = false;
  return {
    current: () => value,
    move(pointer) {
      if (finished) return value;
      const direction = options.direction ?? 1;
      value = clampNumber(
        options.startValue + (pointer - options.startPointer) * direction,
        options.min,
        options.max,
        options.startValue
      );
      options.onTransient(value);
      return value;
    },
    finish() {
      if (!finished) {
        finished = true;
        options.onCommit(value);
      }
      return value;
    },
    cancel() {
      if (finished) return;
      finished = true;
      options.onCancel?.();
    }
  };
}

export function automationKeyboardResizeValue(options: {
  key: string;
  value: number;
  decreaseKey: string;
  increaseKey: string;
  min: number;
  max: number;
  home: number;
  step?: number;
}): number | null {
  if (options.key === "Home") return options.home;
  if (options.key !== options.decreaseKey && options.key !== options.increaseKey) return null;
  return clampNumber(
    options.value + (options.key === options.decreaseKey ? -(options.step ?? 16) : options.step ?? 16),
    options.min,
    options.max,
    options.value
  );
}

export function automationKeyboardSplitRatios(
  ratios: number[],
  splitIndex: number,
  key: string,
  orientation: "horizontal" | "vertical"
): number[] | null {
  if (key === "Home") {
    return ratios.length ? Array.from({ length: ratios.length }, () => 1 / ratios.length) : ratios;
  }
  const decrease = orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";
  const increase = orientation === "horizontal" ? "ArrowRight" : "ArrowDown";
  if (key !== decrease && key !== increase) return null;
  return resizeAutomationMainSplitRatios(ratios, splitIndex, key === decrease ? -0.04 : 0.04);
}
