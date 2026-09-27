// Barrel for the Flow Bootstrap generation failure taxonomy: every reason a
// build can end grouped by the phase that produced it, the diagnostic a refused
// build publishes, the one table that says what a diagnostic's own fields must
// be, the error it is thrown as, and a constructor for each way a build fails --
// a phase's own catch, the harness's refusal, the exploration's endings.
//
// The whole directory was one 817-line file. It held four separate jobs that had
// each grown a copy of the same knowledge, and a fifth thing -- the state a code
// implies -- written out three times, which is what let the producer and the
// reader drift apart until a live failure came back as one unreadable word.
//
// A stored failure's accounting also carries what a provider said when it
// refused the request (`diagnostic.ts`, `accounting.providerRefusal`). That
// record is built and screened by the adapter that got the answer, typed and
// bounded in `runtime/llm/refusal-record.ts`, and read here through that same
// parse on both sides -- the producer's and the reader's -- so a refusal Core
// stores is a refusal Core reads back. Before it arrived, a build refused with a
// 400 could publish the status and nothing about why.
export * from "./codes.ts";
export * from "./diagnostic.ts";
export * from "./diagnostic-parse.ts";
export * from "./error.ts";
export * from "./evidence-failure.ts";
export * from "./failure-state.ts";
export * from "./harness-failure.ts";
export * from "./harness-vocabulary.ts";
export * from "./phase-failure.ts";
