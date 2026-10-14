# t572 A10b: the chat model sees ask ids

## Outcome

Done. Core's chat model now gets the questions still waiting in the thread, each with its id, in its own instructions. It also gets guidance on putting the right id in `ask.answer`'s `askId`. With two asks waiting, a stub model that reads only its instructions names the right ask, and the answer settles that ask and nothing else. With one ask waiting, nothing changed. No id reaches the thread text, even when the model writes one into its own words.

## What changed and why

All paths are under `packages/fluxiq/src/programs/automation-studio/runtime/conversations/`.

- `instructions/waiting-ask.ts` (new): the type `AutomationStudioConversationWaitingAsk`. It holds the ask id, the kind, the question words, the option labels and the control name. Exported from `instructions/index.ts`.
- `instructions/invocation.ts`: the decision context gains two optional fields:
  - `waitingAsks`
  - `waitingAsksWithheld`
- `conversations.ts` `respondToPersonTurn`: a new private `waitingAsks()` reads the thread's recent turns (the same 50-turn window `pendingAsks` uses). It maps each turn with a pending ask to a waiting ask, using the turn's text as the question.
  - The result goes into the model context and to `respond.ts`.
  - If the read fails, it returns `withheld: true` (the same pattern as `earlierTurns`), so the failure is not mistaken for "no questions". The structure audit's failure-as-empty rule required this.
- `instructions/prompt.ts`: a new section, `waitingAsksSection`, is placed after the on-screen section. It lists each ask as `  - [<askId>] "<question>" (<kind and options>)`.
  - It shows only when an ask is waiting.
  - When `ask.answer` is offered, it explains how to answer: choose `ask.answer`, pass the person's words, and put the id in `askId`. When more than one ask waits, it adds that an answer without `askId` settles nothing.
  - It explains how to choose: an option named belongs to the choice that offers it; a yes or no goes to the yes-or-no question about what the message mentions. If it is still unclear, the model asks which one, naming the questions in their own words.
  - The example is a library (renewing a borrowed atlas, choosing North or Harbour branch). That is not one of the ten scenarios.
  - It always says the ids are for the model alone and must never be written in a reply or question.
  - If the asks could not be read, it says so and tells the model to leave `askId` out.
- `instructions/respond.ts`: `withoutAskIds` replaces any waiting ask's id in the model's reply, question or lead-in sentence with that ask's question words in quotes ("that question" if there are none). This backs up the instruction (t276). The invocation arguments keep the id, because `ask.answer` needs it.
- Tests:
  - `tests/waiting-asks.test.ts` (new). It uses a real thread and the real `ask.answer`; only the model and port are stubs. Four cases:
    - with two asks waiting, the model sees both ids and the answer settles only the right one; the second answer then settles the remaining one;
    - with one ask waiting, an answer that names none settles it as before;
    - with two waiting and no id named, the answer is still refused (A10 unchanged);
    - an id the model leaks into a question is replaced with the question words.
    
    Each case checks that no id appears in the thread text.
  - `instructions/tests/prompt.test.ts`: two cases added.
    - With `ask.answer` not offered, the asks are listed but no answering guidance is given.
    - With no asks there is no section; when the asks could not be read, a note says so.

`commands/answer-ask.ts` is unchanged. Its A10 refusal and its one-ask behaviour stay as they were. Nothing under `project-agents/**`, `service/project-build/**` or `runtime/service.ts` was touched.

## Commands run and observed results

All from `packages/fluxiq` in the t572 Core worktree:

- `npx tsc --noEmit -p tsconfig.json` -> no output, exit 0. Run before and after the final edit.
- `npx vitest run .../conversations/tests/waiting-asks.test.ts` -> 1 file, 4 tests passed.
- `npx vitest run .../conversations/tests .../conversations/instructions/tests .../conversations/commands/tests/execute.test.ts` -> 14 files, 130 tests passed. This was before the withheld change.
- After the withheld change and the prompt tests: `npx vitest run .../conversations/tests .../conversations/instructions/tests` -> 13 files, 95 tests passed.
- `npx vitest run .../conversations/commands/tests/extension-chat.test.ts` -> 1 file, 13 tests passed.
- `pnpm structure:check` (repository root):
  - first run: 1 failure, `[failure-as-empty]` in `conversations.ts` at line 419, my original `catch` that returned `[]`. I fixed it with the `withheld` flag.
  - rerun: `structure-audit: passed (352 warning(s), 1156 baselined)`.

Nothing reached a model provider; no live run.

## Not verified

- No live run and no real model, so it is unproven whether DeepSeek actually follows the guidance and names the right `askId`.
- The rest of `commands/tests/` beyond `execute.test.ts` and `extension-chat.test.ts`, and the downstream extension, were not run.
- The endpoint's response to the client (`response.decision`) is not cleaned. If the model leaks an id into its reply text, that text still reaches the client in the payload, and `decision.invocation.arguments.askId` carries the id as it always would. Only the thread text is cleaned. If the extension shows `response.decision.text` directly rather than the thread turn, an id could still show there.

## Open questions or contradictions found

- The panel vocabulary (`panel-capabilities/vocabulary.ts:65`) hides how arguments whose names end in `Id` are described, so `askId`'s description never reaches the model. The new section's guidance makes up for this. If you want the description itself shown, the change belongs in `panel-capabilities/`, which this brief did not include.
- The brief asked for nothing on the client response (see Not verified). If it should be cleaned too, `conversations.ts` could apply the same `withoutAskIds` to `reading.decision`.
