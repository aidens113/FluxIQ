import type { ApiResponse, JsonObject, ProgramApiRequestOptions } from "../../programs/program-api";

export type AutomationProjectApi = {
  get<T>(endpoint: string, options?: ProgramApiRequestOptions): Promise<ApiResponse<T>>;
  post<T>(endpoint: string, payload: JsonObject, options?: ProgramApiRequestOptions): Promise<ApiResponse<T>>;
};