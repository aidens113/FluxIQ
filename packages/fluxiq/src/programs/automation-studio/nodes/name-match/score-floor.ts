/**
 * The lowest `nearest` score that is still returned. Below it the answer is
 * `undefined`: a name nobody wrote a near version of must stay an honest
 * failure, or a correction becomes noise.
 *
 * Why 0.25. Measured over the real web and built-in node ids
 * (`web.output.dom-*`, `builtin.*`) against 24 written names a model plausibly
 * produces, the scores fall into two bands with a wide gap:
 *
 * - every name that should resolve scored 0.64 or better — `navigate` ->
 *   `web.output.browser-navigate` 0.64, `compare` -> `builtin.logic.compare`
 *   0.68, `for_each` -> `builtin.control.for-each` 0.73, `filterList` ->
 *   `builtin.data.filter-list` 0.77, `dom-extract-list` ->
 *   `web.output.dom-extract_list` 0.82;
 * - every name genuinely absent from the set scored 0.083 or worse —
 *   `upload-file` 0.083, `sendEmail` 0.070, `screenshot` 0.065,
 *   `http.request` 0.065, `banana` 0.045, `sleep` 0.036.
 *
 * The only case in between was `click-element` -> `web.output.dom-click` at
 * 0.34: a name that shares the intent word and nothing else. That one should
 * resolve, because a wrong correction is visible in the run and repairable,
 * while a refusal costs a paid provider call the evidence says the model does
 * not act on — run `run-mug776kx-0214b287` was refused the same way fourteen
 * times and never corrected itself. So the floor sits inside the measured gap,
 * nearer the absent band, admitting the 0.34 guess and rejecting the 0.083 one.
 */
export const AUTOMATION_STUDIO_NAME_MATCH_SCORE_FLOOR = 0.25;
