import type { ApiResponse, JsonObject, ProgramApiRequestOptions } from "../../programs/program-api";

export interface ProgramCommandTransport {
  get<T = unknown>(endpoint: string, options?: ProgramApiRequestOptions): Promise<ApiResponse<T>>;
  post<T = unknown>(endpoint: string, payload: JsonObject, options?: ProgramApiRequestOptions): Promise<ApiResponse<T>>;
}