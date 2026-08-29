/**
 * Compatibility facade for the persisted Policy document adapter.
 * New Flow Editor implementation code should import from flow-graph.
 */
export {
  countConditionLeaves,
  legacyPolicyInputPorts as generatedPolicyInputPorts,
  legacyPolicyNodeDescription as generatedPolicyNodeDescription,
  legacyPolicyNodeIcon as generatedPolicyNodeIcon,
  legacyPolicyOutputPorts as generatedPolicyOutputPorts,
  flowOutputRole as generatedPolicyOutputRole,
  layoutAutomationFlowNodes as layoutAutomationPolicyNodes,
  legacyPolicyToFlowGraph as policyToReactFlowGraph,
  taskFlowToEditorGraph as taskFlowToReactFlowGraph
} from "./flow-graph";