import { AnyFunc, Dictionary, Listenable, Rule, Tag } from "./types";

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

export type ModelOptions<T> = {
  tags?: Tag<T>[];

  /**
   * LOCAL MODEL ONLY: the model will update specified props according to new input props
   * ```js
   * // WITHOUT UNSTABLE OPTION
   * const counter = model({ count: props.initCount })
   * console.log(counter.count)
   *
   * // initial rendering:
   * props.initCount = 1
   * counter.count = 1
   *
   * // changing counter.count to 2
   * props.initCount = 1
   * counter.count = 2
   *
   * // re-render with new props { initCount: 3 }
   * props.initCount = 3
   * counter.count = 2 // the count value is not the same as initCount
   *
   * // WITH UNSTABLE OPTION
   * const counter = model({ count: props.initCount }, { unstable: { count: true } })
   * console.log(counter.count)
   *
   * // initial rendering:
   * props.initCount = 1
   * counter.count = 1
   *
   * // changing counter.count to 2
   * props.initCount = 1
   * counter.count = 2
   *
   * // re-render with new props { initCount: 3 }
   * props.initCount = 3
   * counter.count = 3 // the count value is the same as initCount
   * ```
   */
  unstable?: {
    [key in keyof T as T[key] extends AnyFunc ? never : key]?:
      | boolean
      | 1
      | 0
      | undefined;
  };

  rules?: { [key in keyof T]?: Rule<Awaited<T[key]>> };

  /**
   * This method will be invoked to load model persisted data until the first property access of the model occurs.
   * @returns
   */
  load?: () => {
    [key in keyof T as T[key] extends AnyFunc ? never : key]?: T[key];
  };

  /**
   * This method will be called to save model data to persistent storage whenever model properties have been changed.
   * @param model
   * @returns
   */
  save?: (model: T) => void;
};
