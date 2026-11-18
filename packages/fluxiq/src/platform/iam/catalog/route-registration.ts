import type { IamAccessLevel } from "@fluxiq/contracts/iam";

/**
 * One panel app route whose action the catalog lists beside the program
 * endpoints: the route the web app's IAM table decides by this action (its
 * `APP_ROUTE_IAM_CONTRACTS` entry names the same action, method and path).
 */
export type IamRouteRegistration = {
  action: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  accessLevel: IamAccessLevel;
  destructive: boolean;
  description: string;
};
