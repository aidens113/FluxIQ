// Re-sealing a project's sealed content under the host's current key, so a host can retire an old key (t747 design note b): content-store objects, gateway trace chunks and manifests, and the wrapped content-address keys.
export * from "./reseal.ts";
export type {
  AutomationStudioProjectContentResealSeams,
  ContentResealItem as AutomationStudioProjectContentResealItem,
  ContentResealKind as AutomationStudioProjectContentResealKind
} from "./context.ts";
