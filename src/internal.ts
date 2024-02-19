import { AnyFunc, Dictionary, Listenable, ModelOptions } from "./types";

export type StateBase = Dictionary;

export type PropBase = {
  get(): any;
};

export type UpdatableProp = PropBase & {
  on: Listenable["on"];
  dispose: VoidFunction;
};

export type StateProp = UpdatableProp & {
  type: "state";
  stale(notify?: boolean): void;
  refresh(): void;
  hasError(): boolean;
  set(value: any): void;
};

export type ActionProp = UpdatableProp & {
  type: "action";
  setDispatcher(dispatcher: AnyFunc): void;
};
export type UnknownProp = PropBase & { type: "unknown" };

export type Prop = StateProp | ActionProp | UnknownProp;

export type PropGetter = (prop: string | symbol) => Prop;
export type PropSetter = (prop: string | symbol, value: any) => boolean;

export type Validator = (value: any, transform?: (value: any) => void) => void;

export const MODEL_TYPE = Symbol("ezmodel.model");

export const NO_WRAP = Symbol("ezmodel.noWrap");

export type ModelApi = {
  id: number;
  strict: boolean;
  dispose: AnyFunc;
  stale: AnyFunc;
  refresh: AnyFunc;
  constructor: () => StateBase;
  descriptors: DescriptorMap;
  rules: Dictionary<Validator | undefined>;
  configure(props: Dictionary, unstable?: Dictionary): void;
  options: ModelOptions<any>;
};

export type DescriptorMap = Record<string, PropertyDescriptor>;
