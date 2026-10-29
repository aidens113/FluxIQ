/**
 * The structural shape of one program API registration the catalog generator
 * reads (`GlobalProgramApiRegistry.endpoints()` returns a superset). It is
 * declared here so the generator never imports from `programs/`.
 */
export type IamEndpointRegistration = {
  programId: string;
  endpoint: string;
  permission: string;
  classification: string;
};
