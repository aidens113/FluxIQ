/** An actual result-feed identity. Storage chunk names, URLs and positions cannot reconstruct it. */
export type AutomationStudioResultEvidenceSourceRef = {
  source: string;
  step: string;
  version: number;
  datasetId?: string;
};
