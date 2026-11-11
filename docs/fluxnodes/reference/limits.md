# Limits

Every bound in one place. A value outside its bound is refused with a named code. See
[errors](errors.md).

## Names, ids and text

| What | Bound |
| --- | --- |
| FluxNode name | 1 to 7 dotted parts, each at most 64 characters, 128 in all. Lowercase `a-z`, `0-9`, `_`, `-`. |
| Runtime id | 1 to 32 of lowercase `a-z`, `0-9`, `-`, starting with a letter. |
| Flow path | At most 8 segments, 64 characters a segment, 256 in all. |
| Run, Flow, step, event and dataset ids | 1 to 128 of `A-Z a-z 0-9 . _ : -`. |
| `correlationId`, `idempotencyKey` | 1 to 128 of `A-Z a-z 0-9 . _ : -`. |
| Spec hash | 64 lowercase hex characters. |
| Resume handle | 16 to 512 of `A-Z a-z 0-9 . _ ~ -`. |
| List cursor | 1 to 512 of `A-Z a-z 0-9 . _ ~ -`. |
| Step label | 1 to 200 characters. |
| Person text (reasons, `waitingFor`, notes) | 1 to 4000 characters. |
| Model id | 1 to 128 of letters, digits, `.`, `_`, `:`, `/`, `-`; starts with a letter or digit. |

## Spec

| What | Bound |
| --- | --- |
| `goal` | 1 to 4000 characters. No control characters. |
| `start` | 1 to 2048 characters. |
| `uses` | At most 64 names. |
| `scope.sites` | At most 64. Each a host name, with an optional port, up to 253 characters. |
| `scope.apps` | At most 64. Each 1 to 128 characters. |
| `scope.acts` | At most 8. |

## Types (inputs and outputs)

| What | Bound |
| --- | --- |
| Nesting depth | 32 |
| Schemas in one document | 4096 |
| Properties in one schema | 512 |
| `enum` values in one schema | 1024 |
| `anyOf` or `oneOf` alternatives | 64 |
| `title` or `description` length | 2000 characters |

## Options

| Option | Bound | Default |
| --- | --- | --- |
| `retries` | integer, 3 to 100 | 3 |
| `budgetUsd` | 0 to 100000 | 5 |
| `timeoutMs` | integer, 1 to 604800000 (7 days) | none |
| `humanness` | integer, 0 to 100 | 0 |
| `judge` | `auto`, `always`, `off` | `auto` |
| `mode` | `auto`, `explore` | `auto` |

## Overrides

| What | Bound |
| --- | --- |
| Prompt entry, `append` | 1 to 4000 characters |
| Prompt entry, `replace` | 1 to 8000 characters |
| Tool description entry, `append` | 1 to 1000 characters |
| Tool description entry, `replace` | 1 to 2000 characters |
| One judge criterion | 1 to 500 characters |
| Judge criteria | At most 20 |
| All override text together | At most 32000 characters |
| Prompt or tool id | 1 to 200 of letters, digits, `_`, `.`, `:`, `-` |
| `deadlines.llmCallMs` | 1000 to 45000 ms |
| `deadlines.judgeMs` | 30000 to 1800000 ms |
| `deadlines.personWaitMs` | 1000 to 604800000 ms |
| `deadlines.modelSilence.baseMs` | 1000 to 60000 ms |
| `deadlines.modelSilence.capMs` | 1000 to 600000 ms |
| `retryWaits.backoffMs` | 1 to 100 entries, each 0 to 30000 ms |
| `retryWaits.perNodeMs` | 0 to 3600000 ms |
| `retryWaits.perRunMs` | 0 to 86400000 ms |
| `pace.minStepGapMs` | 0 to 600000 ms |

Text may hold newlines and tabs, and no other control character.

## Model requests

| What | Bound |
| --- | --- |
| One model request | The context window of the model that serves it, less the room kept for its reply |
| Elements, rows or pages sent | No count limit |

With `overrides.models`, each role's requests are built to its own model's window, not the
explore model's. A judge on a smaller model gets a request sized to that model.

When what a run got does not fit the judge's window whole, the judge is still asked. Core
summarises evidence items one at a time until the request fits, and never drops one silently:

1. The views of the site go first: the start, the end, and the end view.
2. Then what was looked at, the pages read, the acts, and the model's own words.
3. The rows go last: first down to their labels, then down to counts.

Each summarised item stays in its place as `core.summarised`. It says what the item held,
in counts only. A `summarised` entry at the end of the request names every item that was
summarised and how many there were. It also tells the judge that a yes must stand on what
was shown whole.

If even the shortest form does not fit, the request is refused for its size and the check
counts as not judged.

## Run results and events

| What | Bound |
| --- | --- |
| `lineage` entries in a result | At most 1000 |
| `datasets` in a result | At most 64 |
| `records` in a `transform_needed` event or its answer | At most 1000 |
| `waitingEventIds` on a run | At most 64 |
| `issues` in an error body | At most 200 |

## HTTP

| What | Bound |
| --- | --- |
| Request body | 1 MB |
| `GET /runs` `limit` | 1 to 200, default 50 |
| Event stream keep-alive | Every 15 seconds |
| `stop` waits for the run to end | Up to 30 seconds |
| `person_needed` waits for your answer | 10 minutes by default |

## Pipelines

| What | Bound |
| --- | --- |
| Steps | 1 to 200 |
| `map` `concurrency` | 1 to 64 |
| `map` `skipProcessedBy` | 1 to 8 fields |
| `map` `reuseResultsForMs` | Up to 31 days |
| `transform` `batchSize` | 1 to 1000 |
| `dedupe` key, `join` on, `sort` by, `aggregate` groupBy | At most 8 each |
| `aggregate` measures | 1 to 32 |
| Expression nesting depth, nodes, members | 32, 2000, 256 |
| Field path | At most 16 steps, 256 characters as text |
