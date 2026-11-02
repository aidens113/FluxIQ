export type VerifiedExecutionEvidence =
  | {
      readonly kind: "interrupted";
      readonly reason: "aborted" | "timed_out" | "callback_threw" | "observer_failed";
    }
  | {
      readonly kind: "command_delivery";
      readonly commandId: string;
      readonly claimDigest: string;
      readonly receiptDigest: string;
    }
  | {
      readonly kind: "required_consumed";
      readonly commandId: string;
      readonly handlingDigest: string;
    }
  | {
      readonly kind: "returned_unverified";
      readonly completionDigest: string;
    }
  | {
      readonly kind: "terminal_unknown" | "required_latched";
      readonly code: string;
    }
  | {
      readonly kind: "coverage_complete";
      readonly disposition: "unacted" | "settled";
      readonly completionDigest: string;
      readonly assessmentDigest: string;
    };
