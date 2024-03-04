import { getModelApi } from "../getModelApi";
import { Model, ModelPart, NoInfer } from "../types";

export type CreateModelPartFn = {
  <TPart, TState>(part: (state: TState) => TPart | (() => TPart)): ModelPart<
    TState,
    TPart,
    void
  >;

  <TPart, TState, TVariant>(
    part: (state: TState, variant: TVariant) => TPart | (() => TPart),
    variant: (variant: NoInfer<TVariant>) => unknown
  ): ModelPart<TState, TPart, TVariant>;

  <TPart, TState, TVariant>(
    part: (state: TState, variant: TVariant) => TPart | (() => TPart)
  ): ModelPart<TState, TPart, TVariant>;
};

export const createModelPart: CreateModelPartFn = (
  part: any,
  variant?: any
): any => {
  const def: ModelPart<any, any, any> = Object.assign(
    (input: any, variant?: any) => {
      let model: Model<any>;
      let name: string | undefined;
      if (Array.isArray(input)) {
        [model, name] = input;
      } else {
        model = input;
      }
      const api = getModelApi(model);
      if (!api) {
        throw new Error(`Expected model but got ${model}`);
      }
      return api.part(def, name, variant);
    },
    {
      type: "modelPart" as const,
      part,
      variant: variant ?? ((value: any) => value),
    }
  );

  return def;
};
