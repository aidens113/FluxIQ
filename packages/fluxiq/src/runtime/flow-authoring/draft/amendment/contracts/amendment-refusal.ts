export type AutomationStudioFlowDraftAmendmentRefusal = {
    step: number;
    reason: "no_such_step" | "already_so" | "no_such_position" | "run_by_the_loop" | "no_step_before_it" | "over_not_before" | "not_a_kept_step" | "did_not_work" | "already_in_flow" | "already_out" | "changes_nothing" | "act_on_a_read" | "act_already_named" | "bind_not_a_binding" | "bind_new_key" | "bind_row_outside_loop" | "bind_malformed" | "rerun_holds_binding" | "repeat_taken_off" | "strands_a_step" | "settings_rewrite_run" | "second_copy" | "act_not_done_there";
    over?: number;
    through?: number;
    takenOff?: "over_after" | "span_broken";
    now?: number;
    overNow?: number;
    throughNow?: number;
    act?: string;
    said?: string;
    instead?: number;
    parameter?: string;
    control?: true;
    bindable?: string[];
    replacedBy?: number;
    strands?: number;
    copyOf?: number;
};
