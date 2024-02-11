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

export type AsyncResult<T = any> = Promise<T> & Loadable<T> & Listenable<void>;

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
  readonly result: TResult | undefined;
  readonly error: any;
  readonly loading: boolean;
  readonly awaited: Awaited<TResult> | undefined;
  load(...args: TArgs): TResult;
  reload(): boolean;
  on(listener: Listener<TArgs>): VoidFunction;
};
