/** Every lasting consequence Core can permit, in request display order. */
export const AUTOMATION_STUDIO_ACTION_CONSEQUENCES = Object.freeze([
  /** Spends, charges, refunds or transfers money, or commits to a payment. */
  "move_money",
  /** Deletes or removes something so that it is gone. */
  "delete",
  /** Sends or publishes something that other people or systems receive or see. */
  "send_or_publish",
  /** Changes something that already exists. */
  "modify_existing",
  /** Creates something new that stays after the run. */
  "create_new"
] as const);
