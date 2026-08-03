export type CurrentUser = {
  id: string;
  displayName: string;
  roleId: string;
  totpEnabled: boolean;
  pinConfigured: boolean | undefined;
};
