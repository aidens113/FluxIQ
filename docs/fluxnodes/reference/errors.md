# Errors

A refused request is not a run ending. A run, once started, ends only as `achieved`,
`budget_out`, `stopped` or `waiting_for_person`.

There are three kinds of named code.

1. **API error codes** (`error.code`): why the engine refused the request. See below.
2. **Issue codes** (`error.issues[].code`): where and why a body was not valid. Overrides, run
   requests, specs, inputs and answers all have them.
3. **SDK error codes** (`SdkError.code`): refusals that happen in your process, before or
   instead of a call.

Each issue has a JSON Pointer `path`, a `code` and a `message`. The message says what to do.

## API error codes

| Code | Status | Cause | Fix |
| --- | --- | --- | --- |
| `invalid_request` | 400 | The body or query was refused, the body was not JSON, it was larger than 1 MB, a `POST` was not `application/json`, or the path or method is wrong (404 and 405 use this code too). `issues` says where. | Read `issues`, fix the body, and send `Content-Type: application/json`. |
| `invalid_spec` | 400 | The body's `spec` was refused (`POST /specs`, or an inline `spec` on `POST /runs`): every issue is under `/spec`. | Read `issues`. See the `spec.*` codes below. |
| `invalid_inputs` | 400 | The inputs do not fit the FluxNode's input type, or a goal placeholder has no input. | Send every input the goal names, in the declared types. See the `inputs.*` codes. |
| `unknown_fluxnode` | 404 | No FluxNode has that name. | Register it first (`POST /specs`) or run it with an inline `spec`. |
| `unknown_spec_hash` | 404 | The FluxNode has no spec with that hash. | Drop `specHash` to use the latest, or register that spec. |
| `unknown_run` | 404 | No run has that id, or no run this engine can continue has that resume handle. Runs live in memory, so a restart forgets them. | Use the `runId` the start call returned, in the same engine process. |
| `unknown_event` | 404 | The run has no event with that id. | Answer an `eventId` from the event stream. |
| `event_already_answered` | 409 | The event was already answered, or it stopped waiting. | Do not answer twice. Read `waitingEventIds` on the run for what still waits. |
| `answer_mismatch` | 409 | The answer is for another kind of event. | Send `check_answer` to `check_needed`, `person_answer` to `person_needed`, and `transform_answer` to `transform_needed`. |
| `run_ended` | 409 | The run has ended, so it cannot be answered or stopped. | Read its result with `GET /runs/{runId}`. |
| `idempotency_conflict` | 409 | The `idempotencyKey` was used with a different request. | Use a new key for a different request. |
| `unauthenticated` | 401 | No valid key or session. A local engine in open mode (the default of `fluxiq dev`) never answers this; one that requires a key does. The SDK proves its key again once and repeats the call before it throws. | Run `fluxiq init`, or set `FLUXIQ_KEY`. |
| `forbidden` | 403 | A key without the grant, or an open-mode guard refused the call. | See [calling a local engine](http-api.md#calling-a-local-engine). Send `FluxIQ-Client`, use a loopback host, and send no `Origin`. |
| `internal` | 500 | Core failed. The message says no more than is safe. | Try again. If it repeats, report it with the run id. |

The engine has no call-rate limit and no "not now" refusal: a call is answered, or the connection fails
(`connection` below).

A run that throws inside Core is not an error response. It ends `stopped` with what it had,
after a `failed` step event.

## Overrides codes

These come from [overrides](overrides.md), in `issues`, under `/overrides` (or `/spec/overrides`).

| Code | Cause | Fix |
| --- | --- | --- |
| `overrides.section_locked` | An entry for a locked section. It holds the words for a mechanical gate or a reply format. | Remove the entry. See the section table in [overrides](overrides.md#sections). |
| `overrides.section_append_only` | `replace` on an append-only section. It holds a safety rule that must stay. | Use `{ mode: "append" }`. |
| `overrides.tool_append_only` | `replace` on a tool that may only be appended to: `core.run_node`, or any tool id outside the core list. | Use `{ mode: "append" }`. |
| `overrides.unknown_section` | A prompt id that is not a section. | Take the id from `FLUXNODE_PROMPT_SECTIONS`. |
| `overrides.safety_not_overridable` | A key or id that names a safety gate: it matches permission, consequence, scope, grant, captcha, robot, human check, person needed, secret, denied, screen, redact or credential. | Remove it. These gates are Core's and cannot be overridden. See [safety](../guides/safety.md). |
| `overrides.too_large` | All override text together is over 32000 characters. | Shorten the text or remove entries. |

Other mistakes in overrides come back as the validator's own codes, with a path. For example
`unrecognized_keys` for a key that is not a field, `too_big` for text past its bound, and
`invalid_union_discriminator` for a `mode` that is not `append`, `replace` or `default`.

## Run request codes

| Code | Cause | Fix |
| --- | --- | --- |
| `run_request.target` | Not exactly one of `spec`, `name`, `resumeHandle` and `pipeline`. | Give one. |
| `run_request.spec_hash_without_name` | `specHash` without `name`. | Add `name`, or remove `specHash`. |
| `run_request.inputs_on_resume` | `inputs` with `resumeHandle`. | Remove `inputs`. A resumed run keeps its own. |
| `run_request.options_on_resume` | `options` with `resumeHandle`. | Remove `options`. A resumed run keeps its first options. |
| `run_request.overrides_on_resume` | `overrides` with `resumeHandle`. | Remove `overrides`. A resumed run keeps its first overrides. |
| `run_request.overrides_on_pipeline` | `overrides` on a pipeline run, inline or by a name that holds a pipeline (an inline one is refused by the contract; one by name answers `invalid_request` with this issue). | Declare `overrides` on the FluxNodes the pipeline calls. A pipeline run takes `options` only. |
| `register_request.target` | Not exactly one of `spec` and `pipeline` in `POST /specs`. | Give one. |

## Pin codes

| Code | Cause | Fix |
| --- | --- | --- |
| `fluxnode.pinned_change_held` | Not a refusal of the run. On a run's `result.pinned.held` and as a skipped `step` event: the FluxNode is pinned, and this run's repair or exploration would have changed its Flow. The run still got its result. The change waits as a proposal. | Review it with `POST /fluxnodes/{name}/export` (`proposals`, `flow.proposals`). Adopt it with `fluxiq pin <name> --proposal <id>`, or `{ "pin": true, "proposal": "<proposalId>" }`. See [pinning](../guides/pinning.md). |
| `export_flow.unknown_proposal` | `pin: true` named a `proposal` that is not waiting (already adopted, replaced, or never made). Answered as `invalid_request` with this issue at `/proposal`. | Export without `pin` and take a `proposalId` from `proposals`. |
| `export_flow.proposal_without_pin` | `proposal` without `pin: true`. Answered as `invalid_request` with this issue at `/proposal`. | Add `"pin": true`. Only a pin adopts a proposal. |

## Spec, goal and input codes

| Code | Cause | Fix |
| --- | --- | --- |
| `spec.goal_bad_brace` | A `{` or `}` in the goal that is not a placeholder. | Write `{{` or `}}` for a literal brace. |
| `spec.goal_undeclared_input` | The goal uses `{name}` but no input `name` is declared. | Declare it under `inputs.properties`. |
| `spec.start_not_address` | A `web` start that is not an `http` or `https` address. | Use a full address such as `https://market.example/`. |
| `spec.start_out_of_scope` | The start's site is outside `scope.sites`. | Add the site to `scope.sites`. |
| `spec.uses_self` | `uses` lists the FluxNode itself. | Remove it. |
| `flow_interface.inputs_not_object` | `inputs` is not `"type": "object"`. | Declare inputs as an object with each input under `properties`. |
| `goal.bad_brace`, `goal.missing_input` | Filling the goal found a bad brace or a missing input. | As above, and give every input the goal names. |
| `inputs.goal_input_missing` | The goal names an input the run did not give. | Add that input. |
| `inputs.<code>` | A run input does not fit its declared type. `<code>` is one of `type`, `const`, `enum`, `required`, `additional_property`, `min_items`, `max_items`, `min_length`, `max_length`, `format`, `minimum`, `maximum`, `any_of`, `one_of_none`, `one_of_many`, `not_json`. The path says which input. | Fix the value. |
| `type_schema.<code>` | An input or output type is not in the supported subset. | See [spec](spec.md#input-and-output-types). |
| `invalid` | A value that could not be read at all. | Check the JSON. |

## Answer, verdict and result codes

| Code | Cause | Fix |
| --- | --- | --- |
| `answer.reason_missing` | A failed `check_answer` with no `reason`. | Say why it failed. |
| `answer.reason_unexpected` | A passed `check_answer` with a `reason`. | Leave the reason out. |
| `answer.transform_form` | A `transform_answer` without exactly one of `records` and `error`. | Send one. |
| `verdict.by`, `verdict.reason_missing` | A verdict that breaks its shape. These are for anyone building their own result reader. | |
| `run_result.achieved_refuted`, `run_result.resume_missing`, `run_result.resume_unexpected`, `run_result.waiting_for`, `run_result.time_order` | A run result that breaks its shape. | |
| `run_state.result`, `run_state.status_mismatch` | A run state that breaks its shape. | |
| `event_frame.no_data`, `event_frame.not_json`, `event_frame.id_mismatch`, `event_frame.type_mismatch` | An event frame that could not be read. | |

## Pipeline codes

| Code | Cause | Fix |
| --- | --- | --- |
| `pipeline.duplicate_step` | Two steps share an id. | Make ids unique. |
| `pipeline.unknown_step` | A step's `input`, or a join's `with.step`, is not an earlier step. | Name an earlier step. |
| `data_step.transform_form` | A transform with both or neither of `expression` and `callback`. | Give exactly one. |
| `data_step.batch_without_callback` | `batchSize` on a transform that has no callback. | Use a callback or drop `batchSize`. |
| `data_step.measure_field` | An aggregate: `count` with a field, or another measure with none. | `count` takes no field. The others name the field. |
| `lineage.step_missing` | A lineage entry names a step that is not there. | |
| `expression.<code>` | A bad expression. | The message says where. |

## SDK error codes

`SdkError` has `code`, `message`, `issues` and a `hint`. An engine refusal is a
`FluxNodeApiError`, which has `apiCode` and `status` too.

| Code | Cause | Fix |
| --- | --- | --- |
| `invalid_definition` | `defineFluxNode` or `pipeline(...).build()` was given something the contracts refuse. A locked override section throws this at definition time. | Read `issues`. |
| `invalid_schema` | A zod schema or JSON Schema is outside the supported subset. | See [spec](spec.md#input-and-output-types). |
| `invalid_inputs` | Run inputs do not fit the declared zod type. | Fix the inputs. |
| `invalid_outputs` | Outputs do not fit the declared type. | |
| `key_unreadable`, `key_insecure`, `key_missing` | A key that was named could not be used. | Fix the key file or its permissions, or name another. |
| `connection` | The engine could not be reached. | Run `fluxiq dev`, or pass `url`. |
| `protocol` | The engine refused the call or answered something the contracts do not describe. | For an engine refusal, read `apiCode`. |
| `stream_lost` | The event stream ended before the run did and could not be resumed. | Read the run with `getRun`. |
| `aborted` | Your `AbortSignal` was already aborted. | |
| `run_request.options_on_resume`, `run_request.overrides_on_resume` | A resume was given options or overrides. Raised in your process, before any request. | Do not pass them to `resume`. |
| `run_request.overrides_on_pipeline` | A pipeline run was given overrides. Raised in your process, before any request. | Declare them on the FluxNodes the pipeline calls. |
| `cli` | A command line the CLI could not follow. | Run `fluxiq help`. |
