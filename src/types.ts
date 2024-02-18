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

export type Action<TResult, TArgs extends any[]> = {
  (...args: TArgs): TResult;
  readonly called: number;
  readonly prevResult: TResult | undefined;
  readonly result:
    | (TResult extends Promise<infer R> ? AsyncResult<R> : TResult)
    | undefined;
  readonly error: any;
  readonly loading: boolean;
  readonly awaited: Awaited<TResult> | undefined;
  load(...args: TArgs): TResult;
  reload(): boolean;
  on(listener: Listener<TArgs>): VoidFunction;
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

export type StateBase = Dictionary;

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
    [key in keyof T as key extends `_${string}` ? never : key]: T[key] extends (
      ...args: infer TArgs
    ) => infer TResult
      ? Action<TResult, TArgs>
      : T[key] extends Promise<infer R>
      ? AsyncResult<R>
      : T[key];
  },
  "init"
>;

export type NonFunctionProps<T> = {
  [key in keyof T as T[key] extends AnyFunc ? never : key]: T[key];
};

export const MODEL_TYPE = Symbol("ezmodel.model");

export const NO_WRAP = Symbol("ezmodel.noWrap");

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
