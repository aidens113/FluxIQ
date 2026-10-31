# Unit2 Down authored example tails

Outcome: Done

Source is frozen. No further source edits are pending from this worker.

## Changes

- Added exact literal line arrays in Down `domain/src/runtime/llm-evidence/script-examples/{format,act,loop,state}.ts`, composed as public-contract `WEB_FLOW_SCRIPT_EXAMPLES` with independent version `web-examples-1`, plus owning barrel.
- Required `flowScriptExamples` on the Down-owned runtime type and supplied the companion in the actual `createWebAutomationLlmEvidenceRuntime` binding. Exported the composed examples from its owning llm-evidence barrel.
- Added owning parity tests with fixed pre-extraction UTF8 byte lengths/SHA256 and independent metadata/runtime-supply tests. No systemInstructions text or registry behavior changed.

## Exact boundaries and pinned originals

Each tail starts at the first complete `Example` line, following the existing last grammar line. The renderer supplies exactly the one newline between that prefix and tail. All subsequent example headings, indentation and empty authored lines are retained unchanged. These are source-authored strings, with no browser/run data.

| Section | Original constant | First tail line (original source line) | UTF8 bytes | SHA256 |
| --- | --- | --- | ---: | --- |
| format | AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT | `Example:` (214) | 6154 | 71df264a2c345227a15f9bf5955ed35169619552210336e664f86b06e005ec67 |
| act | AUTOMATION_STUDIO_FLOW_SCRIPT_ACT_EXAMPLE | `Example, acting on one item:` (285) | 3916 | 2290b5399c44fb4100400e88cd40394fe800258eb0484eef2438ef6250626697 |
| loop | AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT | `Example, reading every page of a list:` (457) | 8808 | 6713cc27611efe0e4b941492cfbf3b82c95ad43a01851e53c8f85503f20323bd |
| state | AUTOMATION_STUDIO_FLOW_SCRIPT_STATE_FORMAT | `Example, starting where the page already is:` (575) | 7451 | 1f691ad3d071deee2e5271e3fd74679eae754d819282273cfb40fd3c979ba2e4 |

The pins were captured now from old public SDK constants before extraction. Source-copy preparation compared each copied literal tail against the exact ending of its corresponding SDK string. This preparation is not the acceptance test. An initial CommonJS require-resolution attempt could not select the SDK's ESM export; the subsequent ESM import succeeded and produced the pins above.

The parity test uses public constants and public renderer. While the old constant contains the exact known suffix, it removes that suffix only to obtain grammar; once extracted it takes the constant as the grammar prefix. The four fixed byte/digest oracles remain identical on either side. Production composition does not import, parse or infer examples from Core constants.

## Lead acceptance selectors

- `pnpm --filter @fluxiq-web-extension/domain test runtime/llm-evidence/script-examples runtime/llm-evidence/system-instructions`
- `pnpm --filter @fluxiq-web-extension/domain check`
- `pnpm structure:check`

Validation: not run; brief prohibits checks/builds. Only source reads and preparation/copy of exact authored strings with original byte/digest capture were performed.

Not verified: test execution, typecheck, structure audit, schema consumers after unit3, browser/provider behavior. No Core source, versions, baselines, shared documents, git, browsers, providers or keys touched.

Changed: Down `domain/src/runtime/llm-evidence/script-examples/**`, `domain/src/runtime/llm-evidence/tools.ts`, `domain/src/runtime/llm-evidence/index.ts`; this owning report.

Report: `docs/working/framework-heavy-lifting-plan/reports/codex-1031/p10-client-examples/unit2-down-report.md`

Notes: Prefix grammar remains Core-owned. No realistic fixture names/tasks were added. Source frozen for lead validation and serial unit3 extraction.
