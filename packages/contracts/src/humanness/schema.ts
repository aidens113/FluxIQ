import { z } from "zod";
import { HUMANNESS_MAX, HUMANNESS_MIN } from "./bounds.ts";

/** A humanness level: an integer from `HUMANNESS_MIN` to `HUMANNESS_MAX`. */
export const humannessSchema = z.number().int().min(HUMANNESS_MIN).max(HUMANNESS_MAX);
