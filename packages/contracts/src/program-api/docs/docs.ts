// Inputs of the Docs endpoints the panel assistant may read.

import { z } from "zod/v4";
import { programApiInput } from "../input/index.ts";

/** `snapshot`: the documentation sources and pages. Takes nothing. */
export const docsSnapshotInput = programApiInput(z.object({}));

/** `get-page`: one documentation page. */
export const getDocsPageInput = programApiInput(z.object({
  pageId: z.string().trim().min(1).describe("The page to read, as the documentation list names it.")
}));
