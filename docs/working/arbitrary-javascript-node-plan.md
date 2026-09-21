# Arbitrary JavaScript Flow Node Plan

Status: Active
Status detail: Core authoring/catalog/review work is queued with the paired downstream browser executor and live proof.
Created: 2026-09-20
Last updated: 2026-09-20
Owner: Senior supervisor agent
Scope: Core's domain-neutral contracts for a privileged downstream JavaScript node: catalog visibility, LLM fallback guidance, strict validation, risk/review semantics, and result boundaries.
Paired document: `F:\fxwork\t029\!FluxIQWebExtension\docs\working\arbitrary-javascript-node-plan.md`
Related: [Automation Studio LLM bootstrap](../architecture/automation-studio/llm-flow-bootstrap.md), [MVP Week 2](./mvp-week2-automation-loop-plan.md)

---

## Current State

**Discovery complete; no Core implementation exists.** Core exposes built-in
declarative nodes and trusted-local importer/code implementations, but not a
user-authored JavaScript node. The generic native-node runtime explicitly is not
a security sandbox. The LLM boundary currently rejects conventional executable
code fields recursively.

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

The live-first order and full implementation brief are owned by the paired
downstream document. Core unit/build checks run only after the downstream live
journeys work.

**Next:** a worker implements the paired t029 task when an active MVP worker
slot returns.

**Blockers:** worker capacity only; no architectural blocker identified.

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
