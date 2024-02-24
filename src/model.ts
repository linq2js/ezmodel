import { createModelFactory } from "./createModelFactory";
import { CreateModelPartFn, createModelPart } from "./createModelPart";
import { createModelType } from "./createModelType";
import { NoInfer, Model, ModelOptions } from "./types";

export type ReadonlyModel<T> = Model<Readonly<T>>;

export type State<T> = T extends () => infer R
  ? R
  : T extends new () => infer R
  ? R
  : T;

/**
 * model(base, initFn, options)
 * model(props, options)
 */

export type ModelFn = {
  strict: {
    <TInit>(init: TInit): ReadonlyModel<State<TInit>>;

    <TInit>(
      init: TInit,
      options: ModelOptions<State<NoInfer<TInit>>>
    ): ReadonlyModel<State<TInit>>;
  };

  <TInit>(init: TInit): Model<State<TInit>>;

  <TInit>(init: TInit, options: ModelOptions<State<NoInfer<TInit>>>): Model<
    State<TInit>
  >;

  dynamic<TValue = any>(
    options?: ModelOptions<Record<string, TValue>>
  ): Model<Record<string, TValue>>;

  type: typeof createModelType;

  part: CreateModelPartFn;
};

const createDynamicModel = createModelFactory("dynamic");

export const model: ModelFn = Object.assign(createModelFactory("normal"), {
  strict: createModelFactory("strict"),
  dynamic(options?: ModelOptions<any>) {
    return createDynamicModel({}, options);
  },
  type: createModelType,
  part: createModelPart,
});

export { partOf } from "./createModelPart";
export { dispose, stale, refresh } from "./createModel";
