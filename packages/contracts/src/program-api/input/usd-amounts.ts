// The zod definitions `usdAmount` made. A schema's clones (`.describe`,
// `.meta`) share its definition, so a description added afterwards keeps the
// mark; a new check (`.max`) makes a new definition and loses it, which
// `programApiMoneyFields` then refuses for a field named in dollars.
export const USD_AMOUNTS: WeakSet<object> = new WeakSet();
