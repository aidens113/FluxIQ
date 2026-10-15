// The judge readings of A8 wave 8's exact revisions (t631, bigbox
// `run-mv9gbsm5-2957581c` steps 0053, 0085, 0086, 0109 and 0110), in the words
// of the campsite run of `./campsite-fixture.ts`: nos asking to remove or relax
// name conditions that left out no row by themselves, a no saying a condition
// testing the request's own words "dropped rows ... which the request does not
// exclude", a no calling a left-out campsite stored, the nos that name a real
// defect, and the yes. No task, site, item or answer of any realistic scenario.
import {
  CAMP_BLUEWATER, CAMP_LARCH, CAMP_OSPREY, CAMP_READ, CAMP_REGION, CAMP_SILVER, CAMP_WILLOW,
  NAME_CONDITIONS, OPEN_THIS_WEEKEND
} from "./campsite-fixture.ts";

const EXPECTED = "Every campsite open this weekend and rated 4 or higher, from every page, each once, without promoted entries.";

/** Steps 0053 and 0086: the name conditions called extra narrowing that "can drop" a row, and removing them all advised. */
export const DROP_NAME_CONDITIONS_NO = {
  expected: EXPECTED,
  observed: `4 rows stored with the right columns; read both pages and ended. Condition 2 (${OPEN_THIS_WEEKEND}) and condition 3 (rating atLeast 4) match the request. Conditions 4 (${NAME_CONDITIONS.campground}) and 5 (${NAME_CONDITIONS.notCabin}) are extra narrowings the request does not state; condition 4's leftOutOnlyByThis is empty, so no qualifying row is shown dropped by it, but it can drop a campsite whose name lacks that word.`,
  changed: `Remove conditions 4 and 5 from the where clause of ${CAMP_READ}, or replace them with a condition that keeps exactly what the request states. Keep the region filter at ${CAMP_REGION}, which is the request's own requirement.`
};

/** Step 0085: one sentence keeping conditions 1-3 and calling condition 4 extra, and relaxing it advised. */
export const RELAX_ONE_CONDITION_NO = {
  expected: EXPECTED,
  observed: `4 rows stored with the right columns; condition 2 (${OPEN_THIS_WEEKEND}) and condition 3 (rating atLeast 4) match the request; condition 1 (promoted is absent) matches "Leave out promoted entries"; condition 4 (${NAME_CONDITIONS.campground}) is an extra narrowing the request does not state and could drop a qualifying campsite whose name lacks that exact word.`,
  changed: `Remove or relax condition 4 (${NAME_CONDITIONS.campground}) on ${CAMP_READ}, since the request asks for campsites, not for names containing that word.`
};

/** Step 0109: the availability condition said to have dropped rows "which the request does not exclude", each named. */
export const DROPPED_NOT_EXCLUDED_NO = {
  expected: EXPECTED,
  observed: `Stored 4 rows. Condition 2 (${OPEN_THIS_WEEKEND}) dropped rows whose availability value was "Open next weekend" (${CAMP_LARCH}; ${CAMP_WILLOW}) and rows with "Closed for the season" (${CAMP_OSPREY}), which the request does not exclude.`,
  changed: `Change the read node ${CAMP_READ} where conditions: replace condition 2 (${OPEN_THIS_WEEKEND}) with a condition that keeps rows the request asks for.`
};

/** Step 0110's misread: a campsite the read left out called stored. */
export const LEFT_OUT_CALLED_STORED_NO = {
  expected: EXPECTED,
  observed: `Stored 4 rows including "${CAMP_OSPREY}", which is closed for the season.`,
  changed: "Leave out campsites that are closed."
};

/** A no saying a stored campsite is not one: a claim about a row Core cannot settle. */
export const STORED_CALLED_WRONG_NO = {
  expected: EXPECTED,
  observed: `Stored 4 rows including "${CAMP_BLUEWATER.name}", which is a cabin loop, not a campsite.`,
  changed: "Leave out cabin loops."
};

/** A no naming a campsite the name condition alone left out, which the request asks for: a real defect. */
export const WRONGLY_LEFT_OUT_NO = {
  expected: EXPECTED,
  observed: `Condition 4 (${NAME_CONDITIONS.campground}) dropped ${CAMP_SILVER}, a campsite open this weekend and rated 4.5, which the request asks for.`,
  changed: `Remove condition 4 (${NAME_CONDITIONS.campground}) from ${CAMP_READ}.`
};

/** Step 0053's reasons, with advice that adds a condition besides removing one: more than a change of what it names. */
export const ADVICE_ADDS_NO = {
  ...DROP_NAME_CONDITIONS_NO,
  changed: `Remove condition 4 from ${CAMP_READ} and add a condition leaving out group sites.`
};

/** The yes: each settled condition held to the request's own words, once. */
export const CAMPSITE_YES = {
  answersRequest: "yes",
  expected: EXPECTED,
  observed: `Condition 1 (promoted is absent) follows "Leave out promoted entries". Condition 2 (${OPEN_THIS_WEEKEND}) follows "open this weekend". Condition 3 (rating atLeast 4) follows "rated 4 or higher". The 4 stored campsites meet all three.`
};
