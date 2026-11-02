declare const kernelBrand: unique symbol;

export interface AutomationExecutionKernel {
  readonly [kernelBrand]: never;
}
