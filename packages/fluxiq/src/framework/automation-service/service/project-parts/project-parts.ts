// The project's parts library as a capability the service holds: search it, read a
// part, keep one. Each method is its own file beside this one, and a later one (run)
// joins them the same way. It reads the service only through the ports it is given.
import type {
  GetProjectPartRequest,
  GetProjectPartResponse,
  ListProjectPartsResponse,
  SaveProjectPartRequest,
  SaveProjectPartResponse
} from "../../../../api-contracts/automation.ts";
import { getProjectPart } from "./get.ts";
import type { AutomationStudioProjectPartsDependencies, AutomationStudioProjectPartsRefusal } from "./library-types.ts";
import { listProjectParts, type AutomationStudioListProjectPartsInput } from "./list.ts";
import { keepProjectPart } from "./keep.ts";

export class AutomationStudioProjectParts {
  constructor(private readonly dependencies: AutomationStudioProjectPartsDependencies) {}

  /** Parts by the person's words and by exact filters; each answer is a card. */
  list(input: AutomationStudioListProjectPartsInput): Promise<ListProjectPartsResponse | AutomationStudioProjectPartsRefusal> {
    return listProjectParts(this.dependencies.pool, input);
  }

  /** One part, with no page text in any of it. */
  get(input: GetProjectPartRequest): Promise<GetProjectPartResponse | AutomationStudioProjectPartsRefusal> {
    return getProjectPart(this.dependencies.pool, input);
  }

  /** A person's "save this": saved, or why not in plain words with its code. */
  save(input: SaveProjectPartRequest): Promise<SaveProjectPartResponse | AutomationStudioProjectPartsRefusal> {
    return keepProjectPart(this.dependencies, input);
  }
}
