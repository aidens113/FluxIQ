/**
 * What happened to a verification call that did not come back usable, in
 * words, by its diagnostic code's family. Never the code itself: this sentence
 * is said in the chat, and the code is kept on the record as `failureCode`.
 */
export function callFailureWords(code: string | undefined): string {
  if (code === undefined) return "the verification call did not come back usable";
  if (/(^|[._])aborted$|cancel/.test(code)) return "the judge's call was stopped before it answered";
  if (/timeout$/.test(code)) return "the judge ran out of time before it answered";
  if (/^llm_(budget|usage)\.|budget_exceeded$|usage_limit_exceeded$/.test(code)) return "the judge's call would have gone past its spending or size limit";
  if (/^llm_output\.|^llm\.provider_(malformed_response|output_|response_oversize|usage_invalid|result_summary_invalid)/.test(code)) return "the judge's reply could not be read";
  if (/^llm\.provider_(http_error|network_error|rate_limited|auth_failed|secret_|request_failed|request_setup_failed|redirect_rejected|model_unsupported)/.test(code)) return "the model could not be reached";
  if (/^llm\.request\.|^llm\.provider_.*(_invalid|credential_in_request)$/.test(code)) return "the judge's request could not be sent";
  return "the verification call did not come back usable";
}
