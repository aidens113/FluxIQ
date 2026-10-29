/** A principal's permission boundary, by managed policy name (record `boundary/<principal FRN>`). */
export type IamStoredBoundary = {
  principalFrn: string;
  policy: string;
};
