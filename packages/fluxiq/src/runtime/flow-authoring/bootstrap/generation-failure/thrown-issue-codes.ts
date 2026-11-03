// What an unrecognised throw was, as issue codes a record may carry.
//
// `run-muncqlr0-3348202b` (2026-09-30) ended its build 37 decisions in, right
// after a tool call succeeded, as `flow_bootstrap.pre_provider_validation_failed`
// and nothing else: the build's catch had kept the stage it vouched for and
// dropped the throw, so which line of Core threw could not be read from the run.
//
// Two codes, both Core's own words and neither a sentence: the error's class,
// and where in Core it was thrown -- the first stack frame inside Automation
// Studio, as its path from there and its line. A message is never read, so no
// page text, instruction or credential can ride on it.
import { DIAGNOSTIC_ISSUE_CODE } from "./diagnostic.ts";

const CORE_FRAME = /automation-studio[\\/]((?:[\w.-]+[\\/])*[\w.-]+\.[cm]?[jt]s):(\d+)/u;
/** Frames in this directory are the catch building the failure, not the throw. */
const OWN_FRAME = /generation-failure[\\/]/u;

export function flowBootstrapThrownIssueCodes(thrown: unknown): string[] {
  if (!(thrown instanceof Error)) return [];
  const codes = [`thrown.${thrown.name}`];
  for (const line of (thrown.stack ?? "").split("\n").slice(1)) {
    if (OWN_FRAME.test(line)) continue;
    const frame = CORE_FRAME.exec(line);
    if (!frame) continue;
    codes.push(`thrown.at:${frame[1]!.replace(/[\\/]/gu, ".")}:${frame[2]}`);
    break;
  }
  return codes.filter((code) => DIAGNOSTIC_ISSUE_CODE.test(code));
}
