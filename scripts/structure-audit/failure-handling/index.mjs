// Shared analysis for the rules that audit how a caught failure is handled:
// failure-as-empty and swallowed-failure. Not a rule; the audit loads rules
// only from ../rules/.

export { isEmptyValue, isInlineFunction, isRejection, isRootedAt, someOwn, unwrap } from "./expressions.mjs";
export { errorNames, testsError } from "./caught-error.mjs";
export { isDiscarded, onlySettles, promiseMethod, returnsAValue, yieldsNoValue } from "./promise-chains.mjs";
export { nonTestScripts } from "./non-test-scripts.mjs";
