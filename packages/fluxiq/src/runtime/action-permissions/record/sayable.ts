

export /** The person's words on one line: whitespace collapsed, so a quote never breaks the sentence it sits in. */
function sayable(quote: string): string {
  return quote.replace(/\s+/gu, " ").trim();
}
