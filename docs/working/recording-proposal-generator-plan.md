# Recording Proposal Generator Plan

## Purpose

Automation Studio recordings should be raw, reviewable source material. They
should not automatically turn into a proposal that looks like another recording
as soon as recording stops. The product direction is:

- record messy human/importer behavior;
- let users inspect the recording;
- open a dedicated Proposal Generator when they are ready;
- optionally ask an LLM to help turn that recording into one or more usable
  Flows;
- preserve multiple proposal attempts per recording for comparison and review.

This plan shifts proposals from an automatic post-recording side effect into an
explicit generation workflow.

## Current Seams

- Web auto-generation lives in `AutomationStudioLive.tsx`.
  - `finalizeProjectRecording()` finalizes a recording and then calls
    `processFinalizedRecording()`.
  - client gateway stop handling also calls `processFinalizedRecording()`.
  - `processFinalizedRecording()` first tries
    `create-recording-flow-proposals`, then falls back to
    `process-finalized-recording`.
- Proposal review uses the existing `proposal-workbench` workspace view.
- The project hierarchy currently builds proposal rows with
  `proposalHierarchyNodes(recordings, proposals)`.
  - It groups by client.
  - It does not create a per-recording proposal folder.
- Core proposal artifacts currently live in pipeline storage.
  - `policyProposals` are stored as the single policy proposal path for a
    recording.
  - `recordingFlowProposals` are stored under
    `derived/proposal/flows/{proposalId}.json`.
- Deleting a recording cascades to recording-owned proposals, but proposals are
  not yet a first-class user-deletable hierarchy action.

## Product Terms

| Term | Meaning |
| --- | --- |
| Recording | Raw captured source timeline and state. It is not a draft Flow. |
| Proposal | A generated or assisted draft derived from a recording. Multiple proposals can belong to one recording. |
| Direct Generation | Deterministic mapper/mining generation with no LLM instruction layer. |
| LLM-Assisted Generation | Generation that accepts user instructions and can ask an LLM to shape the proposal. |
| Proposal Generator | Dedicated workspace view that creates new proposals from a selected recording. |
| Proposal Review | Existing workspace view for inspecting, editing, approving, or rejecting a generated proposal. |

## Target UX

Stopping or finalizing a recording should leave the user on the recording
timeline. It may show a status such as:

```text
Recording finalized. Open Proposal Generator when ready.
```

The recording toolbar/sidebar action should expose:

```text
Generate Proposal
```

Clicking it opens a new workspace view:

```text
Proposal Generator: <recording label>
```

Layout:

```text
+------------------------------------------------------------+
| Proposal Generator                                          |
| Recording: Aug 16, 2026, 2:31 PM                            |
+------------------------------------------------------------+
| LLM-Assisted                                                |
|                                                            |
| Goal / instructions                                         |
| [textarea]                                                  |
|                                                            |
| Optional constraints                                        |
| [textarea]                                                  |
|                                                            |
| [ Generate Assisted Proposal ]                              |
+--------------------------- OR -----------------------------+
| Direct Generation                                           |
| Deterministic mapper/mining generation from the recording.  |
|                                                            |
| [ Generate Direct Proposal ]                                |
+------------------------------------------------------------+
```

LLM-assisted generation is the primary section and appears first. Direct
generation is the lower fallback section.

The generator should create a new proposal artifact each time unless the user
explicitly selects an existing proposal to regenerate/replace. This lets users
try different prompts and compare outputs.

## Target Hierarchy

Proposal hierarchy should be grouped under the corresponding base recording:

```text
Proposals
  Local Studio
    Aug 16, 2026, 2:31 PM
      Assisted: Bank cleanup
      Direct: Mapper proposal
      Assisted: Safer retries
```

The proposal folder name should match the base recording's visible recording
label. Proposal rows should use proposal metadata when available:

- user-provided title;
- generation mode: `assisted` or `direct`;
- mapper id or model/provider label;
- generated time as a fallback.

## Generation Metadata

Every new proposal should retain enough metadata for hierarchy, deletion,
review, and future LLM audit:

```ts
type ProposalGenerationMode = "direct" | "llm_assisted";

type ProposalGenerationMetadata = {
  recordingId: string;
  generationMode: ProposalGenerationMode;
  title?: string;
  instructions?: string;
  constraints?: string;
  createdFromView?: "proposal-generator";
  generatedBy?: "recording_mapper" | "evidence_miner" | "llm_assistant";
  llm?: {
    provider?: string;
    model?: string;
    promptVersion?: string;
  };
};
```

Core can store this inside existing proposal metadata first. A dedicated shared
type can follow once the generator behavior is stable.

## Step 1: Stop Automatic Proposal Generation

**Status:** implemented 2026-08-16.

**Goal:** finalizing/stopping a recording should not generate proposals.

### Web changes

- Update `finalizeProjectRecording()` so it only finalizes the recording.
- Remove the immediate call to `processFinalizedRecording()` from finalize.
- Update finalize status text from "Generating proposal..." to a neutral
  "Recording finalized" message.
- Update client gateway stop handling so it no longer calls
  `processFinalizedRecording()` after a stopped recording is detected.
- Update `ClientViews.tsx` copy that currently says stopped recordings are
  generating proposals.
- Keep manual generation paths callable for the new Proposal Generator.

### Core changes

- Do not remove `process-finalized-recording` or
  `create-recording-flow-proposals` yet; the generator will call them.
- If any core endpoint implicitly calls proposal generation during finalize,
  split it out so `finalize-recording` is recording-only.

### Acceptance criteria

- Stopping a recording creates/updates a recording only.
- Finalizing a recording creates/updates a recording only.
- No proposal row appears until the user explicitly opens the generator and
  starts generation.
- Existing recordings can still manually generate proposals.

### Implementation notes

- `finalizeProjectRecording()` now finalizes and refreshes recording state only.
- gateway stop monitoring now opens the timeline and refreshes final data only.
- client-gateway stop copy no longer says proposals are generated
  automatically.
- Manual generation functions remain in place for the Proposal Generator view.

### Remaining follow-up

- Step 2 must add the Proposal Generator view and route existing Generate
  Proposal actions there.

## Step 2: Add Proposal Generator Workspace View

**Status:** implemented 2026-08-16.

**Goal:** create a new window view dedicated to proposal generation.

### Web changes

- Add a new view type, for example:

```ts
{ id: "proposal-generator", label: "Proposal Generator", type: "proposal-generator" }
```

- Add it to workspace defaults/palette only where appropriate.
- Add renderer support in `AutomationViewRenderer`.
- The view input should include:
  - selected recording;
  - selected recording details/timeline if loaded;
  - existing proposals for that recording;
  - generation status;
  - callbacks for direct and LLM-assisted generation.
- Keep `proposal-workbench` as the review/edit/apply surface.

### UI spec

- Two vertical sections.
- Top section: `LLM-Assisted`.
  - proposal title input;
  - instructions textarea;
  - constraints textarea;
  - optional toggles later: "prefer existing mapper actions", "include state
    evidence", "create reusable subflows";
  - primary button: `Generate Assisted Proposal`.
- Separator: centered `OR`.
- Bottom section: `Direct Generation`.
  - short description;
  - button: `Generate Direct Proposal`.
- Show generation progress and errors in the generator view, not as a global
  blocking overlay.
- After generation succeeds:
  - select the new proposal;
  - open/activate `proposal-workbench`;
  - keep the generator view available for more attempts.

### Acceptance criteria

- `Generate Proposal` opens the generator, not proposal review.
- Users can generate a proposal from the generator.
- Existing proposal review still opens when selecting an existing proposal row.

### Implementation notes

- Added `proposal-generator` as a workspace view type and palette entry.
- Added `AutomationProposalGeneratorView` with the LLM-assisted section above
  Direct Generation and a centered `OR` separator.
- Timeline `Generate Proposal` now opens the generator for the selected
  recording instead of running generation directly.
- Proposal review remains available through existing proposal rows and
  `Open Corresponding Proposal`.

### Remaining follow-up

- Step 3 wires Direct Generation to explicit manual proposal creation.
- Step 4 replaces the assisted placeholder with the generation endpoint
  contract and metadata persistence.

## Step 3: Manual Direct Generation

**Status:** implemented 2026-08-16.

**Goal:** direct generation remains available but becomes explicit.

### Web changes

- Move direct-generation calls out of automatic recording-finalize paths.
- Wire `Generate Direct Proposal` to the current deterministic endpoint.
- The direct path should call `create-recording-flow-proposals` first when
  mapper proposals are available.
- If no mapper proposals are available, it may fall back to
  `process-finalized-recording`.
- The button should be disabled while generation for that recording is in
  flight.

### Core changes

- Allow creating a new proposal per generation request.
- Avoid returning "Proposal already current" as the default behavior for manual
  generation.
- Keep an explicit replace/regenerate option separate from new proposal
  creation.

### Acceptance criteria

- Clicking direct generation creates a proposal on demand.
- Clicking it again can create another proposal attempt.
- A replace/regenerate operation is only used when the user explicitly chooses
  an existing target proposal.

### Implementation notes

- Direct generation is now triggered from `AutomationProposalGeneratorView`.
- Web calls the new `generate-recording-proposal` endpoint with `mode:
  "direct"`.
- The result is merged into pipeline artifacts and the generated proposal opens
  in Proposal Review.

### Remaining follow-up

- Step 8 will add explicit replace semantics. Direct generation currently
  creates new attempts by default.

## Step 4: LLM-Assisted Generation Contract

**Status:** implemented 2026-08-16 as deterministic fallback contract.

**Goal:** define the API shape before wiring a provider.

### Endpoint shape

Introduce or extend an endpoint with a generation mode:

```ts
type GenerateRecordingProposalInput = {
  projectId: string;
  recordingId: string;
  mode: "direct" | "llm_assisted";
  title?: string;
  instructions?: string;
  constraints?: string;
  replaceProposalId?: string;
};
```

Initial implementation can store instructions and route to the deterministic
generator. The LLM call can be added behind the same contract later.

### LLM-assisted behavior

The LLM-assisted path should eventually receive:

- recording summary;
- normalized action timeline;
- adjacent state snapshots by reference, not full screenshot payloads;
- available native node/output definitions;
- existing proposal attempts for context;
- user instructions and constraints.

It should produce either:

- a proposal artifact directly; or
- a structured generation plan that deterministic code validates and converts
  into proposal artifacts.

### Acceptance criteria

- Assisted form submissions are persisted in proposal metadata.
- The generated proposal is distinguishable from direct proposals.
- LLM provider failures do not corrupt the recording or existing proposals.

### Implementation notes

- Added Core `generateRecordingProposal()` with `mode`, `title`,
  `instructions`, `constraints`, and future `replaceProposalId` input.
- Added API endpoint `generate-recording-proposal`.
- Assisted submissions persist prompt metadata and `generationMode:
  "llm_assisted"` on generated proposal artifacts.
- Until an LLM planner is connected, assisted mode uses the deterministic
  generation fallback and records `llm.provider: "pending"`.

### Remaining follow-up

- Step 8 will make `replaceProposalId` active.
- A later LLM-planning slice should replace the deterministic fallback behind
  the same endpoint contract.

## Step 5: Multiple Proposals Per Recording

**Status:** implemented 2026-08-16.

**Goal:** proposals become attempts, not a singleton per recording.

### Core changes

- Ensure policy proposal IDs and recording-flow proposal IDs are unique per
  generation attempt.
- Stop overwriting the single `derived/proposal/proposal.json` path for any new
  multi-proposal mode.
- Prefer paths like:

```text
recordings/sessions/<recordingId>/derived/proposals/<proposalId>/proposal.json
recordings/sessions/<recordingId>/derived/proposals/<proposalId>/flow.json
```

- Keep current `recordingFlowProposals` style paths if they already support
  multiple IDs, but align folder naming around `proposals/<proposalId>`.
- Pipeline indexes should retain all proposal attempts until deleted.

### Web changes

- `selectProposalForRecording()` should not treat the latest proposal as
  automatically current after generation unless the generation just produced it.
- Proposal review state should track selected proposal id explicitly.

### Acceptance criteria

- One recording can have many proposals.
- Refreshing the page preserves all proposal attempts.
- Proposal rows remain associated with their base recording.

### Implementation notes

- Policy proposal IDs now include a UUID per attempt.
- New recording-owned proposal files write under
  `derived/proposals/<proposalId>/...`.
- Legacy proposal read fallback keeps older `derived/proposal/...` files
  readable.
- Pipeline indexes retain all active attempts until a proposal or its source
  recording is deleted.

### Remaining follow-up

- Step 8 completed explicit replacement behavior.

## Step 6: Proposal Hierarchy Grouping

**Status:** implemented 2026-08-16.

**Goal:** group proposals by base recording folder.

### Web changes

- Update `proposalHierarchyNodes(recordings, proposals)`.
- Current grouping:

```text
client folder -> proposal row
```

- New grouping:

```text
client folder -> recording folder -> proposal row
```

- Recording folder id should be stable, for example:

```text
proposals-recording-<stable recording id>
```

- Proposal row id remains stable by proposal id.

### Acceptance criteria

- Proposal rows appear under a folder named after their recording.
- Deleting a recording removes its proposal folder and proposal rows.
- Multiple proposal rows under one recording stay visually separated from other
  recordings.

### Implementation notes

- `proposalHierarchyNodes()` now emits client folders, then per-recording
  proposal folders, then proposal rows.
- Proposal row labels prefer generation metadata title, then mode plus
  mapper/generated detail.

### Remaining follow-up

- Step 7 adds proposal-specific deletion from those rows.

## Step 7: Proposal Deletion

**Status:** implemented 2026-08-16.

**Goal:** proposal artifacts can be deleted without deleting the recording.

### Core changes

- Add endpoint:

```text
delete-proposal
```

- Input:

```ts
{
  projectId: string;
  proposalId: string;
  kind?: "policy" | "recording_flow" | "auto";
}
```

- Delete the proposal artifact document.
- Remove it from pipeline index.
- Remove it from the owning recording pipeline document.
- Do not delete the source recording.
- Do not delete shared state/screenshot objects unless they become unreferenced
  through normal object pruning.

### Web changes

- Proposal hierarchy rows expose delete action.
- Deleting a proposal closes proposal tabs/views directly tied to that proposal.
- If the selected proposal is deleted, selection should move to:
  - another proposal for that recording if available; otherwise
  - the source recording.

### Acceptance criteria

- Users can delete individual proposals.
- Deleting a proposal does not delete the recording.
- Deleted proposal rows disappear immediately without refresh.
- Related proposal tabs close immediately.

### Implementation notes

- Added Core `deleteProposal()` and API endpoint `delete-proposal`.
- Proposal deletion removes artifact documents, pipeline index entries, and the
  proposal id from the source recording pipeline document.
- Proposal rows now expose delete actions; proposal folders remain generated
  grouping nodes.
- Web state removes deleted proposals immediately and closes related proposal
  selections/views.

### Remaining follow-up

- Step 8 adds explicit replace controls for selected proposal attempts.

## Step 8: Regeneration And Replace Semantics

**Status:** implemented 2026-08-16.

**Goal:** make "new attempt" versus "replace this proposal" explicit.

### UI

- Generator default: create a new proposal.
- Proposal Review may expose:
  - `Duplicate into Generator`;
  - `Regenerate as New Attempt`;
  - `Replace This Proposal`.

### Core

- `replaceProposalId` replaces only the chosen proposal.
- Without `replaceProposalId`, generation creates a new proposal id.

### Acceptance criteria

- Users cannot accidentally overwrite a proposal by clicking Generate.
- Regeneration history is inspectable through separate proposal rows.

### Implementation notes

- Generator default creates a new proposal attempt.
- Proposal Review now exposes `Regenerate as New Attempt` and `Replace This
  Proposal` as separate actions.
- `replaceProposalId` is active in Core and deletes only the selected target
  proposal after the replacement has been successfully written.

### Remaining follow-up

- Future LLM planning can use the same replace/new-attempt contract for
  assisted generation.

## Step 9: Documentation And Tests

**Status:** implemented 2026-08-16.

### Tests

- Web:
  - finalize recording does not call generation;
  - generator view renders LLM-assisted section above Direct section;
  - Generate Proposal opens generator view;
  - hierarchy groups proposals under recording folders;
  - proposal deletion updates state and closes related tabs.
- Core:
  - multiple proposals per recording;
  - delete proposal removes index and documents;
  - direct generation can create new attempts;
  - replace generation updates only the target proposal.

### Implementation notes

- Added Core coverage for multiple proposal attempts and deleting one attempt
  without deleting the source recording.
- Added web coverage for the Proposal Generator section order and proposal
  hierarchy grouping under recording folders.
- Updated authored Automation Studio docs for workspace behavior, persistence,
  client gateway stop handling, and importer guidance.
- Regenerated deterministic framework reference docs after adding the
  `generate-recording-proposal` and `delete-proposal` API declarations.

### Validation

- `pnpm --filter fluxiq test -- runtime/service.test.ts pipeline-model.test.ts`
- `pnpm --filter @fluxiq/web test -- model.test.ts ProposalGeneratorView.test.tsx deletion.test.ts`
- `pnpm --filter fluxiq check`
- `pnpm --filter @fluxiq/web check`
- `pnpm docs:check`

### Docs

- Update `docs/architecture/automation-studio/workspace.md`.
- Update `docs/architecture/automation-studio/persistence.md`.
- Update `docs/integrations/automation-studio-importing-repos.md`.
- Regenerate framework reference if exported API contracts change.

## Rollout Order

1. Stop automatic generation.
2. Add generator view shell and open it from Generate Proposal.
3. Wire direct generation in the generator.
4. Group proposal hierarchy by recording folder.
5. Add proposal deletion.
6. Make multiple-proposal creation the default.
7. Add LLM-assisted endpoint contract and metadata persistence.
8. Add actual LLM planning/generation behind the assisted path.

This order gives immediate relief from surprise auto-generation while keeping
existing deterministic generation usable during the transition.
