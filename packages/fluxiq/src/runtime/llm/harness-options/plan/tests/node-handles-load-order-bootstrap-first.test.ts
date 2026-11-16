// The handle check when `bootstrap-completion.ts` loads first: the order that
// failed (t358). See `node-handles-load-order.ts`. The import order is the
// variable under test: keep `bootstrap-completion.ts` above the handle check.
import "../../bootstrap-completion.ts";
import * as check from "../node-handles.ts";
import { describeHandleCheckLoadedIn } from "./node-handles-load-order.ts";

describeHandleCheckLoadedIn("bootstrap-completion loads first (the order that failed)", check);
