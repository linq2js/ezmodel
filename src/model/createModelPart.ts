import { getModelApi } from "../getModelApi";
import { ModelPart, NoInfer } from "../types";

export type CreateModelPartFn = {
  <TPart, TState, TVariant>(
    part: (state: TState, variant: TVariant) => TPart | (() => TPart),
    variant: (variant: NoInfer<TVariant>) => unknown
  ): ModelPart<TState, TPart, TVariant>;

  <TPart, TState, TVariant>(
    part: (state: TState, variant: TVariant) => TPart | (() => TPart)
  ): ModelPart<TState, TPart, TVariant>;

  <TPart, TState>(part: (state: TState) => TPart | (() => TPart)): ModelPart<
    TState,
    TPart,
    void
  >;
};

export const createModelPart: CreateModelPartFn = (
  part: any,
  variant?: any
): any => {
  return {
    type: "modelPart",
    part,
    variant: variant ?? ((value: any) => value),
  };
};

export type PartFn = {
  <TState, TPart, TVariant>(
    state: TState,
    partDef: ModelPart<NoInfer<TState>, TPart, TVariant>,
    ...args: void extends TVariant ? [] : [variant: TVariant]
  ): TPart;

  <TState, TPart, TVariant>(
    state: TState,
    name: string,
    partDef: ModelPart<NoInfer<TState>, TPart, TVariant>,
    ...args: void extends TVariant ? [] : [variant: TVariant]
  ): TPart;
};

export const partOf: PartFn = (model: any, ...args: any[]): any => {
  let name: string | undefined;
  let def: ModelPart<any, any, any>;
  let variant: any;

  // get named part
  if (typeof args[0] === "string") {
    [name, def, variant] = args;
  } else {
    // get unnamed part
    [def, variant] = args;
  }

  return getModelApi(model)?.part(def, name, variant);
};
