"use client";

import { useEffect, useRef, useState } from "react";
import type { RecordingViewDataPort } from "./recording-api-types";
import { initialRecordingPage, type RecordingPage } from "./recording-model";

export function useRecordingListController(input: {
  active: boolean;
  dataPort: Pick<RecordingViewDataPort, "queryPage">;
  projectId: string | null;
  recordings: any[];
}) {
  const recordingsRef = useRef(input.recordings);
  recordingsRef.current = input.recordings;
  const [page, setPage] = useState<RecordingPage>(() => initialRecordingPage(input.recordings));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!input.active) {
      requestRef.current += 1;
      setLoading(false);
      return;
    }
    const requestId = ++requestRef.current;
    setLoading(true);
    setError("");
    if (!input.projectId) {
      const recordings = recordingsRef.current;
      setPage((current) => ({
        recordings: recordings.slice(current.offset, current.offset + current.limit),
        limit: current.limit,
        offset: current.offset,
        total: recordings.length
      }));
      setLoading(false);
      return;
    }
    void input.dataPort.queryPage({
      projectId: input.projectId,
      limit: page.limit,
      offset: page.offset
    }).then((result) => {
      if (requestRef.current !== requestId) return;
      if (!result.ok) {
        setError(result.error ?? "Recordings could not be loaded.");
        setLoading(false);
        return;
      }
      const resultPage = result.payload?.page ?? {
        limit: page.limit,
        offset: page.offset,
        total: result.payload?.recordings?.length ?? 0
      };
      setPage({ recordings: result.payload?.recordings ?? [], ...resultPage });
      setLoading(false);
    });
    return () => {
      requestRef.current += 1;
    };
  }, [input.active, input.dataPort, input.projectId, page.limit, page.offset, reload]);

  return {
    page,
    loading,
    error,
    openPage(offset: number) {
      setPage((current) => current.offset === offset ? current : { ...current, offset });
    },
    retry() {
      setReload((value) => value + 1);
    }
  };
}