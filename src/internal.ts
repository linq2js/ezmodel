import {
  AnyFunc,
  Dictionary,
  Listenable,
  ModelOptions,
  ModelPart,
  ModelType,
} from "./types";

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
export type ValueProp = PropBase & { type: "value"; set(value: any): void };
export type UndefinedProp = PropBase & { type: "undefined" };
export type PrivateProp = PropBase & { type: "private" };

export type Prop =
  | StateProp
  | ActionProp
  | UnknownProp
  | UndefinedProp
  | PrivateProp
  | ValueProp;

export type PropGetter = (prop: string | symbol) => Prop;
export type PropSetter = (prop: string | symbol, value: any) => boolean;

export type Validator = (value: any, transform?: (value: any) => void) => void;

export const MODEL_TYPE = Symbol("ezmodel.model");

export const NO_WRAP = Symbol("ezmodel.noWrap");

export type ModelKind = "normal" | "strict" | "dynamic";

export type ModelApi = {
  id: number;
  kind: ModelKind;
  dispose: AnyFunc;
  stale: AnyFunc;
  refresh: AnyFunc;
  constructor: (proxy: any) => readonly [StateBase, DescriptorMap];
  descriptors: DescriptorMap;
  rules: Dictionary<Validator | undefined>;
  configure(props: Dictionary, unstable?: Dictionary | "all"): void;
  options: ModelOptions<any>;
  type: ModelType<any, any, any> | undefined;
  part(
    def: ModelPart<any, any, any>,
    name: string | undefined,
    variant: any
  ): any;
};

export type DescriptorMap = Record<string, PropertyDescriptor>;

export const PRIVATE_PROP_ERROR = "Cannot read private prop";
