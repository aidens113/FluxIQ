// What a call whose no Core's record refutes is told when it is asked once
// more (t607): Core's findings, stated as what Core measured, and the request
// to answer again from the evidence. Never an instruction to answer yes, and
// never anything of a site or task but the rows and columns Core's record
// itself names.

/** The recheck a call whose every reason for no Core's record refutes is asked again with (header). */
export function automationStudioResultRefutedNoRecheckWords(findings: readonly string[]): string {
  return "This same evidence was judged before, and that answer was no for reasons Core's own record of this run contradicts. "
    + `Core's record: ${findings.join(" ")} `
    + "Answer again from the evidence, holding what you say about these rows to that record. If you answer no, say in observed, as before, each row that is wrong or missing and why.";
}
