/** The managed policies attached to one principal (record `attachments/<principal FRN>`). */
export type IamStoredAttachments = {
  principalFrn: string;
  policies: string[];
};
