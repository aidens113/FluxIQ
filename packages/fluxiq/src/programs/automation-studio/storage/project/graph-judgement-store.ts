// The verdicts, bound to the graph versions they were about.
//
// `schema/graph-judgements.ts` says why the table exists and what its
// nullable columns mean. This is the whole of what writes and reads it, and it
// only records: no rule here decides that a version was worse than another,
// and nothing here restores anything. That comes after there is something to
// decide from.
import { AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS } from "./administration.ts";
import type { AutomationStudioProjectDatabaseLease, AutomationStudioProjectDatabasePool } from "./database.ts";
import { AutomationStudioSchemaMigrationRunner } from "../schema-migrations.ts";

export type AutomationStudioFlowGraphJudgementStatus = "confirmed" | "refuted" | "unverified" | "no_result";

/** One verdict, about one graph Flow at one revision, reached by one run. */
export type AutomationStudioFlowGraphJudgementRecord = {
  flowId: string;
  revisionNumber: number;
  runId: string;
  subflowId: string | null;
  status: AutomationStudioFlowGraphJudgementStatus;
  code: string;
  instructionDigest: string | null;
  decidedAtMs: number;
};

/** What one run's verdict is written as: the verdict once, against every version it judged. */
export type AutomationStudioFlowGraphJudgementWrite = {
  runId: string;
  status: AutomationStudioFlowGraphJudgementStatus;
  code: string;
  instructionDigest: string | null;
  decidedAtMs: number;
  versions: readonly { graphFlowId: string; revision: number; subflowId?: string | undefined }[];
};

export class AutomationStudioProjectFlowGraphJudgementStore {
  private constructor(private readonly lease: AutomationStudioProjectDatabaseLease) {}

  static async open(input: { pool: AutomationStudioProjectDatabasePool; projectId: string }): Promise<AutomationStudioProjectFlowGraphJudgementStore> {
    const lease = await input.pool.acquire(input.projectId);
    try {
      await new AutomationStudioSchemaMigrationRunner({ database: lease.database, migrations: AUTOMATION_STUDIO_PROJECT_ADMINISTRATION_MIGRATIONS }).migrate();
      return new AutomationStudioProjectFlowGraphJudgementStore(lease);
    } catch (error) {
      await lease.release();
      throw error;
    }
  }

  close(): Promise<void> {
    return this.lease.release();
  }

  /**
   * The verdict, written once per version the run executed.
   *
   * A version with no revision number is not offered here at all -- a graph
   * with no chain is carried on the run as `revision: null` and has no version
   * to be judged -- and one that arrives anyway is refused by the table's own
   * `revision_number > 0` check rather than being quietly rounded up to 1.
   *
   * The write replaces rather than ignores a row already on
   * `(flow, revision, run)`. One run can reach this twice: a refuted result is
   * repaired, the corrected Flow is re-run under the *same run id*, and the
   * re-run is judged in its turn. Where the repair moved the graph the second
   * verdict lands on a new revision and both rows stand; where it did not, the
   * settled verdict is the later one and it must win, because the first was
   * about a Flow that has since been changed.
   */
  async record(input: AutomationStudioFlowGraphJudgementWrite): Promise<AutomationStudioFlowGraphJudgementRecord[]> {
    const runId = requiredId(input.runId, "run");
    const written: AutomationStudioFlowGraphJudgementRecord[] = [];
    for (const version of input.versions) {
      const flowId = requiredId(version.graphFlowId, "flow");
      const revisionNumber = Math.trunc(version.revision);
      const subflowId = version.subflowId ? requiredId(version.subflowId, "subflow") : null;
      await this.lease.database.run(
        `insert or replace into flow_graph_judgements
           (flow_id, revision_number, run_id, subflow_id, status, code, instruction_digest, decided_at_ms)
         values (?, ?, ?, ?, ?, ?, ?, ?)`,
        [flowId, revisionNumber, runId, subflowId, input.status, input.code, input.instructionDigest, Math.trunc(input.decidedAtMs)]
      );
      written.push({ flowId, revisionNumber, runId, subflowId, status: input.status, code: input.code, instructionDigest: input.instructionDigest, decidedAtMs: Math.trunc(input.decidedAtMs) });
    }
    return written;
  }

  /** Every judgement on one graph Flow, newest revision first. */
  async listForFlow(input: { flowId: string; limit?: number }): Promise<AutomationStudioFlowGraphJudgementRecord[]> {
    const rows = await this.lease.database.all<JudgementRow>(
      "select * from flow_graph_judgements where flow_id = ? order by revision_number desc, decided_at_ms desc, run_id limit ?",
      [requiredId(input.flowId, "flow"), Math.max(1, Math.min(500, Math.trunc(input.limit ?? 100)))]
    );
    return rows.map(judgementFromRow);
  }

  /** Every judgement one run reached, one per version it executed. */
  async listForRun(runId: string): Promise<AutomationStudioFlowGraphJudgementRecord[]> {
    const rows = await this.lease.database.all<JudgementRow>(
      "select * from flow_graph_judgements where run_id = ? order by flow_id, revision_number desc",
      [requiredId(runId, "run")]
    );
    return rows.map(judgementFromRow);
  }
}

type JudgementRow = {
  flow_id: string;
  revision_number: number;
  run_id: string;
  subflow_id: string | null;
  status: AutomationStudioFlowGraphJudgementStatus;
  code: string;
  instruction_digest: string | null;
  decided_at_ms: number;
};

function judgementFromRow(row: JudgementRow): AutomationStudioFlowGraphJudgementRecord {
  return {
    flowId: row.flow_id,
    revisionNumber: row.revision_number,
    runId: row.run_id,
    subflowId: row.subflow_id,
    status: row.status,
    code: row.code,
    instructionDigest: row.instruction_digest,
    decidedAtMs: row.decided_at_ms
  };
}

function requiredId(value: string, kind: string): string {
  const id = value.trim();
  if (!id || id.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(id)) throw new Error(`Invalid ${kind} ID.`);
  return id;
}
