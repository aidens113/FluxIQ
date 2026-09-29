"use client";

import { AlertCircle, CircleCheck, CircleDot, Lock, RefreshCcw } from "lucide-react";
import { ONBOARDING_COPY } from "./onboarding-copy";
import { onboardingSteps } from "./onboarding-steps";
import { useOnboardingReadings } from "./useOnboardingReadings";
import type { OnboardingSources, OnboardingStartOptionId, OnboardingStep } from "./types";

export type OnboardingViewProps = {
  sources: OnboardingSources;
  onStart(option: OnboardingStartOptionId): void;
  /** Opens the Connected browsers view, when the host can navigate to it. */
  onOpenConnectedBrowsers?: () => void;
  /** Re-check interval while unfinished; 0 checks once. Default 5 seconds. */
  pollMs?: number;
  now?: () => number;
};

/**
 * First-run setup: runtime, pairing, DeepSeek key, in that order, each shown
 * as done, current, or blocked with one concrete action. Then the one-line
 * explanation of how FluxIQ uses AI and the three ways to start.
 */
export function OnboardingView(props: OnboardingViewProps) {
  const pollMs = props.pollMs ?? 5_000;
  const now = props.now ?? Date.now;
  const probe = useOnboardingReadings(props.sources, { pollMs, isComplete: (readings) => onboardingSteps(readings, now()).every((step) => step.state === "done") });
  const steps = onboardingSteps(probe.readings, now());
  const complete = steps.every((step) => step.state === "done");
  return <OnboardingLayout complete={complete} onRefresh={probe.refresh} steps={steps} {...props} />;
}

function OnboardingLayout(props: OnboardingViewProps & { steps: OnboardingStep[]; complete: boolean; onRefresh(): void }) {
  return (
    <section aria-label="Get started with FluxIQ" className="automation-runs-workspace automation-onboarding">
      <header>
        <div><strong>Get started</strong><span>{props.complete ? "FluxIQ is ready." : "Three steps before your first automation."}</span></div>
        <button className="button" onClick={props.onRefresh} type="button"><RefreshCcw aria-hidden size={14} />Check again</button>
      </header>
      <ol className="automation-onboarding-steps">
        {props.steps.map((step, index) => (
          <li aria-current={step.state === "current" ? "step" : undefined} className={`automation-onboarding-step ${step.state}`} data-state={step.state} data-step={step.id} key={step.id}>
            <StepIcon state={step.state} />
            <div>
              <strong>{index + 1}. {step.title}</strong>
              <span className="automation-onboarding-state">{step.state === "done" ? "Done" : step.state === "current" ? "Next" : `Blocked: finish step ${props.steps.findIndex((candidate) => candidate.id === step.blockedBy) + 1} first`}</span>
              <span>{step.detail}</span>
              {step.problem ? <span className="automation-runtime-message" role="alert"><AlertCircle aria-hidden size={14} />{step.problem}</span> : null}
              {step.state === "done" ? null : <StepAction onOpenConnectedBrowsers={props.onOpenConnectedBrowsers} step={step} />}
            </div>
          </li>
        ))}
      </ol>
      <p className="automation-onboarding-message">{ONBOARDING_COPY.valueMessage}</p>
      <div aria-label="Start an automation" className="automation-onboarding-start" role="group">
        {ONBOARDING_COPY.startOptions.map((option) => (
          <button className="button" key={option.id} onClick={() => props.onStart(option.id)} type="button"><strong>{option.label}</strong><span>{option.description}</span></button>
        ))}
      </div>
    </section>
  );
}

function StepAction(props: { step: OnboardingStep; onOpenConnectedBrowsers: (() => void) | undefined }) {
  const action = props.step.action;
  return (
    <div className="automation-onboarding-action" data-action-for={props.step.id}>
      <span>{action.label}: {action.location}</span>
      {action.command ? <code>{action.command}</code> : null}
      {action.href ? <a className="button" href={action.href}>Open Secret Keys</a> : null}
      {props.step.id === "pairing" && props.onOpenConnectedBrowsers ? <button className="button" onClick={props.onOpenConnectedBrowsers} type="button">Open Connected browsers</button> : null}
    </div>
  );
}

function StepIcon(props: { state: OnboardingStep["state"] }) {
  if (props.state === "done") return <CircleCheck aria-hidden size={18} />;
  if (props.state === "current") return <CircleDot aria-hidden size={18} />;
  return <Lock aria-hidden size={18} />;
}
