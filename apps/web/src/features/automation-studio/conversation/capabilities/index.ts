// The conversational command surface: what the panel can do, declared once and
// invocable from a control or from the chat window.

export {
  PANEL_CAPABILITY_ASKING_CONSEQUENCES,
  definePanelCapability,
  panelCapabilityAsksFirst,
  panelCapabilityResult,
  type PanelCapability,
  type PanelCapabilityArgument,
  type PanelCapabilityArgumentKind,
  type PanelCapabilityArgumentValue,
  type PanelCapabilityArguments,
  type PanelCapabilityContext,
  type PanelCapabilityContextKey,
  type PanelCapabilityControl,
  type PanelCapabilityGroup,
  type PanelCapabilityOutcome
} from "./contract";
export { PANEL_CAPABILITIES } from "./catalog";
export {
  PANEL_ENDPOINTS_WITHOUT_A_CAPABILITY,
  panelCapabilities,
  panelCapabilitiesByGroup,
  panelCapability,
  panelCapabilityEndpoints,
  panelCapabilityIds
} from "./registry";
export {
  PANEL_CAPABILITY_CONFIDENT_MATCH,
  resolvePanelCapability,
  type PanelCapabilityMatch,
  type PanelCapabilityResolution
} from "./resolver";
export {
  dispatchPanelCapability,
  panelCapabilityArguments,
  panelCapabilityMissingArguments,
  type PanelCapabilityDispatch,
  type PanelCapabilityRequest
} from "./dispatch";
export {
  describePanelCapabilities,
  isPanelCapabilityQuestion,
  panelCapabilityVocabulary,
  type PanelCapabilityDescription
} from "./answer";
