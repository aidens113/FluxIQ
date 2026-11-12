/**
 * The workspace-wide settings `FluxIQUserAccess` lets a person read to use the
 * workspace, on the workspace FRN, from the panel only (`WorkspaceSettingReads`
 * requires `fluxiq:RequestOrigin` `panel`). Named one by one; reads only.
 *
 * - `secrets:GetAssistantModel`: which key's provider and which model the
 *   panel assistant answers with (Secret Keys' model settings). Its answer is
 *   the same `modelSettings` the filtered `secrets:Snapshot` already carries:
 *   key ids, a provider and a model, never a key's name, value or seal.
 * - `studio:GetPanelAssistantAllowance`: what one message to the assistant may
 *   spend, one dollar figure for the whole workspace, so Settings can show it.
 *
 * Changing either (`secrets:SetAssistantModel`, `secrets:SetDefaultKey`,
 * `studio:SetPanelAssistantAllowance`) acts for the whole workspace and is not
 * here. The registry's escalation test refuses a user every other unfiltered
 * workspace action (programs/_shared/tests).
 */
export const IAM_USER_WORKSPACE_SETTING_READS: readonly string[] = Object.freeze(["secrets:GetAssistantModel", "studio:GetPanelAssistantAllowance"]);
