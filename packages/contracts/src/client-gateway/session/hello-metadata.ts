import type { JsonObject } from "../../core.js";

/**
 * A hello's metadata. Open, as in 0.1; gateway 0.2 names `clientLabel`, the
 * person-readable name of this client ("Work laptop") that the connect
 * consent page and the account's client list show.
 */
export type ClientGatewayHelloMetadata = JsonObject & { clientLabel?: string };
