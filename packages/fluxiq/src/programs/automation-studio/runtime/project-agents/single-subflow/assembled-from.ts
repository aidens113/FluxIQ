import type { AutomationStudioSubflowProposal } from "../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioProjectProposalRef } from "../supervisor/index.ts";

// What one supervisor run knows of the whole revisions it assembled (t679):
// which proposals each was assembled from, so `project.assemble` after a
// single-subflow whole test can answer with that revision instead of making a
// new one, and the dispatch answer can say that the latest assembly is the
// done return's own; and every proposal a single-subflow whole test assembled,
// so the supervisor can read it back by the name a done return gives it.
//
// The second is needed because the build's proposals store learns a proposal
// only from the scoped subflow trial port (`service/project-build/subflow-trials.ts`,
// `weighed`), which a single-subflow brief's test no longer asks.
//
// **Which proposals a whole revision was assembled from, by its number alone
// (t689).** The whole gate names the revision whose trial showed a kept
// condition by its number only; a single-subflow test hands those conditions
// to its builder's gate on the builder's own numbering
// (`./single-subflow-trial.ts`), so the proposals behind a revision are read
// back by that number too. One controller numbers its revisions once each.
//
// Kept per submission controller, which is made once per supervisor run
// (`../supervisor/supervisor-loop.ts`), and weakly, so a finished run's
// memory goes with it.

/** One proposal a whole revision was assembled from, as a done return names it. */
export type AutomationStudioProjectAssembledProposal = { subflowKey: string; briefId: string; revision: number; digest: string };

/** The most proposals one run keeps for reading back; the latest are kept. */
const MAX_PROPOSALS = 200;

const MEMORY = new WeakMap<object, AutomationStudioProjectAssembledFrom>();

export class AutomationStudioProjectAssembledFrom {
  /** Each whole revision's proposals, by the revision's key. */
  private readonly made = new Map<string, string>();
  /** Each whole revision's proposals, by the revision's number (header, t689). */
  private readonly byRevision = new Map<number, AutomationStudioProjectAssembledProposal[]>();
  /** Each proposal a single-subflow whole test assembled, by its brief, revision and digest. */
  private readonly proposals = new Map<string, AutomationStudioSubflowProposal>();

  /** The memory of the run `controller` serves, made on first ask. */
  static of(controller: object): AutomationStudioProjectAssembledFrom {
    const known = MEMORY.get(controller);
    if (known) return known;
    const made = new AutomationStudioProjectAssembledFrom();
    MEMORY.set(controller, made);
    return made;
  }

  /** `candidate` was assembled from exactly `from`. */
  note(candidate: { revision: number; digest: string }, from: readonly AutomationStudioProjectAssembledProposal[]): void {
    this.made.set(candidateKey(candidate), fromKey(from));
    this.byRevision.set(candidate.revision, from.map((entry) => ({ ...entry })));
  }

  /** The proposals the whole revision numbered `revision` was assembled from, as copies; undefined for one this run did not assemble (header, t689). */
  madeOf(revision: number): AutomationStudioProjectAssembledProposal[] | undefined {
    const from = this.byRevision.get(revision);
    return from ? from.map((entry) => ({ ...entry })) : undefined;
  }

  /** Whether `candidate` was assembled from exactly `from`, in any order. */
  madeFrom(candidate: { revision: number; digest: string } | undefined, from: readonly AutomationStudioProjectAssembledProposal[]): boolean {
    return candidate !== undefined && from.length > 0 && this.made.get(candidateKey(candidate)) === fromKey(from);
  }

  /** Keeps a proposal a single-subflow whole test assembled, for reading back by its name. */
  keep(proposal: Readonly<AutomationStudioSubflowProposal>): void {
    const at = proposalKey(proposal.scope.briefId, proposal.revision, proposal.digest);
    this.proposals.delete(at);
    this.proposals.set(at, structuredClone(proposal) as AutomationStudioSubflowProposal);
    while (this.proposals.size > MAX_PROPOSALS) this.proposals.delete(this.proposals.keys().next().value!);
  }

  /** The proposal kept under `ref`'s name, or undefined. */
  proposal(ref: AutomationStudioProjectProposalRef): AutomationStudioSubflowProposal | undefined {
    const found = this.proposals.get(proposalKey(ref.briefId, ref.revision, ref.digest));
    return found && found.scope.subflowKey === ref.subflowKey ? structuredClone(found) : undefined;
  }
}

function candidateKey(candidate: { revision: number; digest: string }): string {
  return `${candidate.revision}\n${candidate.digest}`;
}

function proposalKey(briefId: string, revision: number, digest: string): string {
  return JSON.stringify([briefId, revision, digest]);
}

function fromKey(from: readonly AutomationStudioProjectAssembledProposal[]): string {
  return JSON.stringify(from.map((entry) => [entry.subflowKey, entry.briefId, entry.revision, entry.digest]).sort((left, right) => String(left[0]).localeCompare(String(right[0]))));
}
