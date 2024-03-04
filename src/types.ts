import { MODEL_TYPE, StateBase } from "./internal";

export type AnyFunc = (...args: any[]) => any;

export type NoInfer<T> = [T][T extends any ? 0 : never];

export type Equal<T = any> = (a: T, b: T) => boolean;

/**
 * Empty Object
 */
export type EO = Record<string, never>;

export type Dictionary<
  V = any,
  K extends string | symbol | number = string
> = Record<K, V>;

export type StaleOptions<TValue, TData> = {
  stale: true | ((value: TValue, data: TData) => boolean);
  includeDependencies?: "all" | "error";
};

export type Listenable<T = any> = {
  on: Subscribe<T>;
};

export type Combine<T, N> = T extends N ? (N extends T ? T : T | N) : T | N;

export type Listener<T = any> = (args: T) => void;

export type Subscribe<T = void> = (listener: Listener<T>) => VoidFunction;

export type Loadable<T> =
  | { loading: false; data: T; error: undefined }
  | { loading: false; error: any; data: undefined }
  | { loading: true; data: undefined; error: undefined };

export type AsyncResult<T = any> = Promise<T> &
  Loadable<T> &
  Listenable<void> & { cancel(): void };

export type MaybeAsyncResult<T> = NonNullable<T> extends Promise<infer X>
  ? T extends undefined
    ? undefined | AsyncResult<X>
    : AsyncResult<X>
  : T;

export type ImmutableType =
  | string
  | number
  | boolean
  | bigint
  | null
  | undefined
  | Date
  | symbol
  | RegExp;

export type OnceOptions = { recent?: boolean };

export type Action<T extends AnyFunc> = T & {
  readonly type: "action";
  readonly called: number;
  readonly prevResult: ReturnType<T> | undefined;
  readonly result:
    | (ReturnType<T> extends Promise<infer R> ? AsyncResult<R> : ReturnType<T>)
    | undefined;
  readonly error: any;
  readonly loading: boolean;
  readonly awaited: Awaited<ReturnType<T>> | undefined;
  load(...args: Parameters<T>): ReturnType<T>;
  reload(): boolean;
  on(listener: Listener<Parameters<T>>): VoidFunction;
};

export interface Loader<T> {
  (): AsyncResult<T>;
  (value: T | Promise<T>): void;
  (reducer: (prev: T) => any): void;
  /**
   * make data as staled but do not notify to subscribers
   */
  stale(): void;
  reload(): AsyncResult<T>;
}

export type Inherit<B, D> = {
  [key in keyof B | keyof D]: key extends keyof D
    ? D[key]
    : key extends keyof B
    ? B[key]
    : never;
};

export type Base<T> = T extends readonly [infer TFirst, ...infer TRest]
  ? TRest extends readonly [] // end of array
    ? TFirst
    : TRest extends readonly [infer TLast] // last item
    ? Inherit<TFirst, TLast>
    : Inherit<TFirst, Base<TRest>>
  : T extends Dictionary
  ? T
  : never;

export type Rule<T> =
  | ((value: T) => void | boolean)
  // sugar syntactic for zod
  | { parse(value: T): void }
  // sugar syntactic for other validation lib (ex: yup)
  | { validate(value: T): void };

export type Tag<T = any> = {
  readonly type: "tag";
  readonly count: number;
  readonly all: T[];
  init: (model: T) => any;
  each(callback: (model: T) => void): void;
};

export type PublicProps<T> = Omit<
  {
    // exclude private props
    [key in keyof T as key extends `_${string}`
      ? never
      : key]: T[key] extends AnyFunc
      ? Action<T[key]>
      : MaybeAsyncResult<T[key]>;
  },
  "init"
>;

export type NonFunctionProps<T> = {
  [key in keyof T as T[key] extends AnyFunc ? never : key]: T[key];
};

export type Model<T> = T extends StateBase
  ? PublicProps<T> & {
      /**
       * This is trick for Typescript checking
       * Sometimes you need to pass model as mutable object, it is not safe if you do below
       * ```ts
       * // DON'T
       * const updateTodo = (todo: Todo, newTitle: string) => {
       *  // we cannot ensure the todo object is modal or plain object
       *  // so changing model prop does not trigger any reactive effect
       *  todo.title = newTitle
       * }
       * const todoObject = { title: 'abc' })
       * const todoModel = model({ title: 'abc' }))
       * updateTodo(todoObject; // No error
       * updateTodo(todoModel; // No error
       *
       * // DO
       * const updateTodo = (todo: Model<Todo>) => {
       *  todo.title = newTitle
       * }
       *
       * updateTodo(todoObject; // Typescript error: Property '[MODEL]'  is missing in type Todo
       * updateTodo(todoModel; // No error
       * ```
       */
      [MODEL_TYPE]: true;
    }
  : never;

export type Group<K, V, R = V> = {
  (key: K): R;
  clear(): void;
  readonly size: number;
  each(callback: (value: V, key: K) => void): void;
  delete(keyOrFilter: K | ((key: K) => boolean)): void;
};

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
  load?: (
    model: Model<T>,
    key?: string
  ) => string | null | StateBase | undefined;

  /**
   * This method will be called to save model data to persistent storage whenever model properties have been changed.
   * @param model
   * @returns
   */
  save?: (model: Model<T>, key?: string) => void;

  ref?: { [key in keyof T]?: any } & { key?: any };

  sanitize?: (data: Record<string, unknown>, model: NoInfer<Model<T>>) => void;

  key?: string;
};

export type ModelKey = string | number | boolean;

export type UpdateRecipe<T> = {
  [key in keyof T as T[key] extends AnyFunc ? never : key]?:
    | (T[key] extends Promise<infer R> ? Promise<R> : T[key])
    | ((draft: Awaited<T[key]>) => Awaited<T[key]> | void);
};

export type ModelLoader<T> = (key: any) => T | Promise<T>;

export interface ModelType<
  TState extends StateBase,
  TExtra extends StateBase,
  TStrict = false
> {
  readonly type: "modelType";
  readonly size: number;
  (props: TState): TStrict extends true
    ? Model<Readonly<TState & TExtra>>
    : Model<TState & TExtra>;

  (props: TState[]): TStrict extends true
    ? Model<Readonly<TState & TExtra>>[]
    : Model<TState & TExtra>[];

  load(
    loader: () => Promise<TState[]>
  ): TStrict extends true
    ? AsyncResult<Model<Readonly<TState & TExtra>>[]>
    : AsyncResult<Model<TState & TExtra>[]>;

  load(
    loader: () => Promise<TState>
  ): TStrict extends true
    ? AsyncResult<Model<Readonly<TState & TExtra>>>
    : AsyncResult<Model<TState & TExtra>>;

  strict(): ModelType<TState, TExtra, true>;

  with<T extends StateBase>(
    extraProps: T | ((props: TState & TExtra) => T)
  ): ModelType<TState, TExtra & T, TStrict>;

  init(initFn: (model: Model<TState & TExtra>) => void | VoidFunction): this;

  each(
    callback: (model: Model<TState & TExtra>) => void,
    filter?: (model: Model<TState & TExtra>) => boolean
  ): void;

  alter(
    key: ModelKey | ModelKey[],
    propsOrRecipe: UpdateRecipe<TState> | ((draft: TState & TExtra) => void)
  ): Model<TState & TExtra>[];

  alter(
    filter: (model: Model<TState & TExtra>) => boolean,
    propsOrRecipe: UpdateRecipe<TState> | ((draft: TState & TExtra) => void)
  ): Model<TState & TExtra>[];

  /**
   * Retrieve the model from the cache; if the model is not available in the cache, invoke the loader to obtain it.
   * @param key
   * @param loader
   * @param If `staleWhileRevalidate` is set to `true`, initiate the loader to fetch the latest model and return the existing model from the cache. If the model is not present in the cache, wait for the loader's result to be fulfilled.
   *
   */
  get(
    key: ModelKey,
    loader: (key: any) => TState | Promise<TState>,
    staleWhileRevalidate?: boolean
  ): AsyncResult<Model<TState & TExtra>>;

  get(key: ModelKey, state: TState): Model<TState & TExtra>;

  /**
   * Retrieve the model from the cache using a specific key.
   * @param key
   */
  get(key: ModelKey): Model<TState & TExtra> | undefined;

  /**
   * Clear all models from the cache and execute disposal operations for each one.
   */
  clear(): void;

  /**
   * create model from given value
   * @param value
   */
  from<T>(
    value: T
  ): T extends readonly TState[]
    ? Model<TState & TExtra>[]
    : T extends Promise<readonly TState[]>
    ? AsyncResult<Model<TState & TExtra>[]>
    : T extends Promise<TState>
    ? AsyncResult<Model<TState & TExtra>>
    : T extends TState
    ? Model<TState & TExtra>
    : never;

  lazy(id: ModelKey): AsyncResult<Model<TState & TExtra>>;
  lazy(
    id: ModelKey,
    loader: ModelLoader<TState>
  ): AsyncResult<Model<TState & TExtra>>;

  lazy(props: TState): Model<TState & TExtra>;
  lazy(
    props: TState,
    loader: ModelLoader<TState>
  ): AsyncResult<Model<TState & TExtra>>;
  isLoading(value: unknown): boolean;
}

export namespace Infer {
  export type model<T> = T extends ModelType<
    infer TState,
    infer TExtra,
    infer TStrict
  >
    ? TStrict extends true
      ? Model<Readonly<TState & TExtra>>
      : Model<TState & TExtra>
    : T extends Model<any>
    ? T
    : Model<T>;
}

export type ModelPart<TState, TPart, TVariant> = {
  readonly type: "modelPart";
  (model: [Model<TState>, string], variant: TVariant): TPart;
  (model: Model<TState>, variant: TVariant): TPart;
  part(state: TState, variant: TVariant): TPart;
  variant(value: TVariant): unknown;
};

export type AnyModel = Model<StateBase>;

export type { StateBase } from "./internal";

export type ActionMeta = { name: string };

export type ActionMiddleware = (action: AnyFunc, meta: ActionMeta) => AnyFunc;
