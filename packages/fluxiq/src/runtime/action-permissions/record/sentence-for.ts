import type { AutomationStudioActionDeclarationCrossCheckVerdict } from "../../../flows/executable/permissions/index.ts";
import type { AutomationStudioActionConsequence } from "../../../components/automation/action-effect/consequences/index.ts";
import { sayable } from "./sayable.ts";
import { list } from "./list.ts";
import { permissionConstants } from "./constants.ts";
const { PLAIN } = permissionConstants;

export /**
 * One plain sentence a person can act on, in Core's words.
 *
 * No class codes and no counts. Run `run-muqk4u32-0b36e58f` ended its build on
 * "The instruction asks for modify_existing and create_new, and none of this
 * run's 72 actions said it would cause that": the person cannot read the codes,
 * and the 72 counted every replay of the draft as an action, so the number
 * measured how often the build re-ran its own steps rather than anything the
 * person asked about. Each class is named in plain words with the person's own
 * quoted words beside it, which is what lets them check the reading.
 */
function sentenceFor(input: {
  verdict: AutomationStudioActionDeclarationCrossCheckVerdict;
  undeclared: readonly AutomationStudioActionConsequence[];
  beyondInstruction: readonly AutomationStudioActionConsequence[];
  quotes: ReadonlyArray<{ consequence: AutomationStudioActionConsequence; quote: string }>;
}): string {
  if (input.verdict === "not_comparable") return "Nothing FluxIQ did while building this Flow changed anything, so there is nothing to compare with your instruction.";
  if (input.verdict === "undeclared") {
    const asked = input.undeclared.map((consequence) => {
      const quote = sayable(input.quotes.find((entry) => entry.consequence === consequence)?.quote ?? "");
      return quote ? `${PLAIN[consequence]} ("${quote}")` : PLAIN[consequence];
    });
    return `Your instruction asks to ${list(asked)}, but nothing FluxIQ did while building this Flow said it would.`;
  }
  if (input.verdict === "beyond_instruction") {
    return `While building this Flow, FluxIQ said a step would ${list(input.beyondInstruction.map((consequence) => PLAIN[consequence]))}, which your instruction does not ask for.`;
  }
  return "What FluxIQ said its steps would do while building this Flow matches what your instruction asks for.";
}
