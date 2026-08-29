"use client";

import { useMemo } from "react";
import { useProgramApi } from "../../programs/program-api";
import { repairRecordingStateIndex } from "./recording-commands";
import { queryRecordingPage } from "./recording-queries";
import type { RecordingApi, RecordingViewDataPort } from "./recording-api-types";

export function useRecordingViewDataPort(): RecordingViewDataPort {
  const api = useProgramApi("automation-studio");
  return useMemo(() => ({
    queryPage: (input) => queryRecordingPage(api, input),
    repairStateIndex: (input) => repairRecordingStateIndex(api, input)
  }), [api]);
}

export type { RecordingApi, RecordingViewDataPort } from "./recording-api-types";