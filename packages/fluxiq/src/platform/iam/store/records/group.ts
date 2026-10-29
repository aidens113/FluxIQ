/** A group as stored (record `group/<name>`). Its policies live in its attachments record. */
export type IamStoredGroup = {
  name: string;
  members: string[];
  createdAtMs: number;
};
