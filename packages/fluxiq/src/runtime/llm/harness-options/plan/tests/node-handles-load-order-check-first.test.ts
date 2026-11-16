// The handle check when it loads before `bootstrap-completion.ts`. See
// `node-handles-load-order.ts`. The import order is the variable under test:
// keep the handle check above `bootstrap-completion.ts`.
import * as check from "../node-handles.ts";
import "../../bootstrap-completion.ts";
import { describeHandleCheckLoadedIn } from "./node-handles-load-order.ts";

describeHandleCheckLoadedIn("the handle check loads first", check);
