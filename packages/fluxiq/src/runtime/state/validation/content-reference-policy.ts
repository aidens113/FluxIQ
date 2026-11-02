export type StateContentReferencePolicy = {
  accepts(value: string): boolean;
  rejectedMessage: string;
};
