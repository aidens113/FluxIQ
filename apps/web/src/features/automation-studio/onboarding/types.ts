import type { ApiResponse } from "../../programs/program-api";
import type { ClientGatewaySnapshot } from "../clients/client-model";
import type { ClientGatewayResult } from "../clients/client-api-types";
import type { AiProviderKeySummary } from "../settings";

export type OnboardingStepId = "runtime" | "pairing" | "deepseek-key";

/** `done`: satisfied. `current`: the next thing to do. `blocked`: waits on an earlier step. */
export type OnboardingStepState = "done" | "current" | "blocked";

export type OnboardingAction = {
  label: string;
  /** Where in the product, or on the machine, the action is taken. */
  location: string;
  /** A terminal command, when the action is one. */
  command?: string;
  /** An in-panel link, when the action is one. */
  href?: string;
};

export type OnboardingStep = {
  id: OnboardingStepId;
  title: string;
  state: OnboardingStepState;
  /** What was observed, in one sentence. */
  detail: string;
  action: OnboardingAction;
  /** The earlier step this one waits on, when `state` is `blocked`. */
  blockedBy?: OnboardingStepId;
  /** Set when the check itself could not be read, so "not done" is not mistaken for "absent". */
  problem?: string;
};

/** One read of a source. A failed read is kept as a failure, never as an empty answer. */
export type OnboardingReading<T> =
  | { status: "loading" }
  | { status: "loaded"; value: T }
  | { status: "failed"; error: string };

export type OnboardingReadings = {
  gateway: OnboardingReading<ClientGatewaySnapshot>;
  keys: OnboardingReading<readonly AiProviderKeySummary[]>;
};

/** Injected so the model and view run without a server. */
export type OnboardingSources = {
  loadGatewaySnapshot(): Promise<ClientGatewayResult<ClientGatewaySnapshot>>;
  loadSecretKeys(): Promise<ApiResponse<{ keys?: AiProviderKeySummary[] }>>;
};

export type OnboardingStartOptionId = "describe" | "demonstrate" | "extract";

export type OnboardingStartOption = {
  id: OnboardingStartOptionId;
  label: string;
  description: string;
};
