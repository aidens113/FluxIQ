"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef
} from "react";
import {
  useStoreApi,
  type Edge,
  type Node
} from "@xyflow/react";
import type { AutomationFlowNodeData } from "./node-types";

type FlowNode = Node<AutomationFlowNodeData>;
type NodeLookup = Map<string, FlowNode>;

export type FlowReconnectPerformanceGuardHandle = {
  begin(edge: Edge): void;
  end(): void;
};

const replayedMouseMoves = new WeakSet<Event>();

export const FlowReconnectPerformanceGuard = forwardRef<
  FlowReconnectPerformanceGuardHandle,
  object
>(function FlowReconnectPerformanceGuard(_props, ref) {
  const store = useStoreApi<FlowNode, Edge>();
  const cleanupRef = useRef<() => void>(() => undefined);

  useImperativeHandle(ref, () => ({
    begin(edge) {
      cleanupRef.current();
      const state = store.getState();
      const candidateIds = mountedFlowNodeIds(state.domNode);
      candidateIds.add(edge.source);
      candidateIds.add(edge.target);
      const restoreLookup = scopeNodeLookupValues(
        state.nodeLookup as unknown as NodeLookup,
        candidateIds
      );
      const removeThrottle = installReconnectMouseMoveThrottle(document);
      cleanupRef.current = () => {
        removeThrottle();
        restoreLookup();
        cleanupRef.current = () => undefined;
      };
    },
    end() {
      cleanupRef.current();
    }
  }), [store]);

  useEffect(() => () => cleanupRef.current(), []);
  return null;
});

export function scopeNodeLookupValues<T>(
  lookup: Map<string, T>,
  candidateIds: ReadonlySet<string>
): () => void {
  const ownDescriptor = Object.getOwnPropertyDescriptor(lookup, "values");
  const candidates = [...candidateIds]
    .map((id) => lookup.get(id))
    .filter((node): node is T => node !== undefined);
  const scopedValues = () => candidates.values();
  Object.defineProperty(lookup, "values", {
    configurable: true,
    writable: true,
    value: scopedValues
  });
  return () => {
    if (lookup.values !== scopedValues) return;
    if (ownDescriptor) Object.defineProperty(lookup, "values", ownDescriptor);
    else Reflect.deleteProperty(lookup, "values");
  };
}

function mountedFlowNodeIds(domNode: HTMLDivElement | null): Set<string> {
  if (!domNode) return new Set();
  return new Set([...domNode.querySelectorAll<HTMLElement>(".react-flow__node[data-id]")]
    .map((element) => element.dataset.id)
    .filter((id): id is string => Boolean(id)));
}

function installReconnectMouseMoveThrottle(doc: Document): () => void {
  let animationFrame = 0;
  let pending: MouseEvent | null = null;

  const flush = () => {
    animationFrame = 0;
    const source = pending;
    pending = null;
    if (!source) return;
    const replay = new MouseEvent("mousemove", {
      bubbles: true,
      cancelable: true,
      view: source.view,
      detail: source.detail,
      screenX: source.screenX,
      screenY: source.screenY,
      clientX: source.clientX,
      clientY: source.clientY,
      ctrlKey: source.ctrlKey,
      altKey: source.altKey,
      shiftKey: source.shiftKey,
      metaKey: source.metaKey,
      button: source.button,
      buttons: source.buttons,
      relatedTarget: source.relatedTarget
    });
    replayedMouseMoves.add(replay);
    doc.dispatchEvent(replay);
  };

  const onMouseMove = (event: MouseEvent) => {
    if (replayedMouseMoves.has(event)) return;
    pending = event;
    event.stopImmediatePropagation();
    if (!animationFrame) animationFrame = window.requestAnimationFrame(flush);
  };
  const onMouseUp = () => {
    if (!pending) return;
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
    flush();
  };

  doc.addEventListener("mousemove", onMouseMove, true);
  doc.addEventListener("mouseup", onMouseUp, true);
  return () => {
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    pending = null;
    doc.removeEventListener("mousemove", onMouseMove, true);
    doc.removeEventListener("mouseup", onMouseUp, true);
  };
}
