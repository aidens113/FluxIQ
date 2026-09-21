# Arbitrary JavaScript Flow Node Plan

Status: Active
Status detail: Attempt withholding works, but second adversarial review found graph-session and public-event leaks; paired remediation/live rerun are active.
Created: 2026-09-20
Last updated: 2026-09-20
Owner: Senior supervisor agent
Scope: Core's domain-neutral contracts for a privileged downstream JavaScript node: catalog visibility, LLM fallback guidance, strict validation, risk/review semantics, and result boundaries.
Paired document: `F:\fxwork\t029\!FluxIQWebExtension\docs\working\arbitrary-javascript-node-plan.md`
Related: [Automation Studio LLM bootstrap](../architecture/automation-studio/llm-flow-bootstrap.md), [MVP Week 2](./mvp-week2-automation-loop-plan.md)

---

## Current State

**Implementation implemented; second remediation active.** Core now supports one exact
registered executable-source parameter on an executable, privileged,
operator-approved node, preserves global rejection elsewhere, projects a
trusted bounded result path, and tells providers to prefer purpose-built nodes.
The downstream hand-authored Chromium journey passed.

Core will not execute browser JavaScript. It will own the registered definition
contract supplied by the downstream web domain, keep exact parameter validation,
classify the node as privileged/high-risk, include the fallback capability in a
bounded bootstrap catalog, and instruct providers to use purpose-built catalog
nodes wherever possible. The downstream extension owns execution in an isolated
browser user-script world and returns bounded JSON through the ordinary output
boundary.

Validation must make one narrow exception for the registered source parameter;
unknown code/script fields elsewhere remain refused. Generated source must stay
visible in proposal review, and applying the proposal must continue through the
existing human review and revision/digest gates.

The first remediation now keeps source/input/result sentinels out of saved
command attempts while preserving real adapter execution and result projection.
Second adversarial review found two remaining Core leaks: durable graph/session
traces copy literal effects and outputs, and public/runtime-transport events
publish raw commands or results outside the attempt policy. The paired
downstream document owns the exact second remediation brief and live-first order.

**Next:** extend the trusted definition-owned policy to persisted graph/session
projections and public runtime events, preserving ordinary output compatibility
and ephemeral JavaScript execution/data edges; then rerun the downstream live
oracle before focused persistence/event checks.

**Blockers:** graph-session and public-event privacy defects block integration. Model-authored
selection and Firefox remain validation gaps, not inferred passes.

---

## Work Ledger

### 2026-09-20 — Core boundary selected
- Agent: supervisor
- Changed: this paired working plan only
- Why: Keep browser/DOM execution downstream while Core owns generic authoring, validation, and review policy.
- Validation: source inspection -> no user-authored JS node; trusted-local native runtime states it is not a sandbox; executable-code validation is globally closed today.
- Outcome: Partial
- Follow-up: execute the downstream brief and mirror verified Core status here.

---

## Open Questions

- None beyond the browser capability questions tracked in the paired document.
