export class ContextRouteError extends Error {
  constructor(readonly status: 400 | 401 | 403 | 503, message: string) {
    super(message);
    this.name = "ContextRouteError";
  }
}
