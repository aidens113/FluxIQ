import { browserGatewayChangeSources } from "./browser-sources";
import { GatewayChangeSubscription } from "./subscription";

let shared: GatewayChangeSubscription | undefined;

/** The page's one gateway change subscription, made on first use. Every reader shares it, so the page holds one stream. */
export function sharedGatewayChanges(): GatewayChangeSubscription {
  shared ??= new GatewayChangeSubscription(browserGatewayChangeSources());
  return shared;
}
