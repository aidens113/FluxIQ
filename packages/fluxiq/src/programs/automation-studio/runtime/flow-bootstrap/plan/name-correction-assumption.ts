// What a plan carries when a name in it was resolved rather than written.
//
// A correction that leaves no trace is indistinguishable from a model that got
// the name right, and a run's evidence has to be able to say which happened:
// a Flow that read the wrong parameter because a guess went to the wrong place
// is a different failure from one whose parameter was simply wrong, and only
// the assumption tells them apart.
//
// Every field is a closed code or an identifier the plan or the registry
// already holds -- Subflow and node keys the parser bounded, a definition id,
// a declared parameter id -- so an assumption can travel in a published record
// without carrying page content or a validator's prose. `writtenName` is the
// one value the model chose, and it is kept only when it is identifier-shaped.
import type { AutomationStudioNameValueShape } from "../../../nodes/index.ts";

export type AutomationStudioFlowBootstrapNameAssumption = {
  /**
   * What was assumed. One kind today; a node id resolved the same way would be
   * a second, so readers switch on this rather than assuming every assumption
   * is about a parameter.
   */
  kind: "parameter_name";
  /**
   * How the name was resolved. `normalized` is the same name written with
   * different separators or casing, which is a spelling variant rather than a
   * guess; `nearest` is a scored guess and is the one worth a person's
   * attention.
   */
  how: "normalized" | "nearest";
  /** Name similarity in 0..1, as the matcher scored it, before any tie-break. */
  score: number;
  subflowKey: string;
  nodeKey: string;
  definitionId: string;
  /** The parameter the plan now carries. Always one this definition declares. */
  parameterId: string;
  /**
   * The key as the model wrote it, kept only when it is identifier-shaped.
   * Absent means the written key was not a plain identifier and was left out
   * rather than published; the correction still happened.
   */
  writtenName?: string;
  /**
   * The shape of the value that was written under the name, which the match
   * was given. `unknown` means the value said nothing about what it was --
   * `null`, or a state binding, which resolves to whatever the run holds.
   */
  valueShape: AutomationStudioNameValueShape;
};
