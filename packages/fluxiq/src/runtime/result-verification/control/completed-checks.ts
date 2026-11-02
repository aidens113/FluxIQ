/** Original completed receipts, retained even when a later check never finishes. */
export class CompletedVerificationChecks<TReceipt> {
  private records: TReceipt[] = [];
  private closed = false;

  record = (receipt: TReceipt): void => {
    if (!this.closed) this.records.push(receipt);
  };

  finish(): TReceipt[] {
    this.closed = true;
    return [...this.records];
  }
}
