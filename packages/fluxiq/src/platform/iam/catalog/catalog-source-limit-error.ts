/** Thrown when more registrations declare one action than a catalog entry can list. */
export class IamCatalogSourceLimitError extends Error {
  readonly action: string;
  readonly sourceCount: number;

  constructor(action: string, sourceCount: number, limit: number) {
    super(`Action ${action} is declared by ${sourceCount} registrations; a catalog entry lists at most ${limit}`);
    this.name = "IamCatalogSourceLimitError";
    this.action = action;
    this.sourceCount = sourceCount;
  }
}
