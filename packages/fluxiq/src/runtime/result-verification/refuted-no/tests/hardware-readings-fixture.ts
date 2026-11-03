// The run's no of A8 frozen pair 4 `run-mva446jf-926a3c72` steps 0023-0024
// (t651), in the words of the hardware run of `./hardware-fixture.ts`: the
// seller condition said to test the product's name, and drills it alone left
// out called ones the request asks for. No task, site, item or answer of any
// realistic scenario.
import { DRILL_HALDEN, DRILL_READ, DRILL_TORVIK, HOUSE, SELLER_IS_TITLE } from "./hardware-fixture.ts";

/** A no in the words of the run's judges: the seller condition said to test the name, and three drills it dropped that the store sells itself. */
export const NAME_PREFIX_NO = {
  expected: `Every cordless drill ${HOUSE} sells itself, ready for delivery tomorrow and rated 4 or higher, each once.`,
  observed: `Stored only 2 rows. Condition 3 (${SELLER_IS_TITLE}) dropped 3 rows including ${DRILL_TORVIK} and ${DRILL_HALDEN}, though ${HOUSE} sells them itself: the seller column reads the product name, not the seller.`,
  changed: `Condition 3 on ${DRILL_READ} tests the product name rather than who sells the drill; remove it and narrow by the store's own seller filter instead.`
};

