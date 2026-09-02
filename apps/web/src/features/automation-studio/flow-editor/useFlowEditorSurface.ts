"use client";

import { useState } from "react";

export function useFlowEditorSurface() {
  const [showMiniMap, setShowMiniMap] = useState(false);

  return {
    showMiniMap,
    setShowMiniMap
  };
}
