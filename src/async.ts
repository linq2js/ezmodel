/* eslint-disable max-lines */
import { cancellable } from "./cancellable";
import { getModelApi } from "./getModelApi";
import { scope } from "./scope";
import { trackable } from "./trackable";
import { AnyFunc, AsyncResult, Dictionary, Loadable, Model } from "./types";
import { NOOP, isPromiseLike } from "./utils";

export type Defer<T> = AsyncResult<T> & {
  resolve(value: T): void;
  reject(reason: unknown): void;
};

export type Awaitable<T = any> =
  | (() => T | PromiseLike<T>)
  | PromiseLike<T>
  | Model<any>
  | undefined;

export type AwaitableGroup<T = any> =
  | readonly Awaitable<T>[]
  | Dictionary<Awaitable<T>>;

export type RaceFn = {
  <A extends AwaitableGroup | Exclude<Awaitable, undefined>>(
    awaitable: A
  ): AsyncResult<Partial<AwaitableData<A>>>;

  <A extends AwaitableGroup | Exclude<Awaitable, undefined>, S>(
    awaitable: A,
    onSuccess: (data: Partial<AwaitableData<A>>) => S
  ): AsyncResult<S>;

  <
    A extends AwaitableGroup | Exclude<Awaitable, undefined>,
    S = Partial<AwaitableData<A>>,
    F = never
  >(
    awaitable: A,
    onSuccess: ((data: Partial<AwaitableData<A>>) => S) | undefined | null,
    onFail: (error: unknown) => F
  ): AsyncResult<S | F>;
};

export type AllFn = {
  <A extends AwaitableGroup | Exclude<Awaitable, undefined>>(
    awaitable: A
  ): AsyncResult<AwaitableData<A>>;

  <A extends AwaitableGroup | Exclude<Awaitable, undefined>, S>(
    awaitable: A,
    onSuccess: (data: AwaitableData<A>) => S
  ): AsyncResult<S>;

  <
    A extends AwaitableGroup | Exclude<Awaitable, undefined>,
    S = AwaitableData<A>,
    F = never
  >(
    awaitable: A,
    onSuccess: ((data: AwaitableData<A>) => S) | undefined | null,
    onFail: (error: unknown) => F
  ): AsyncResult<S | F>;
};

export type WaitFn = {
  <A extends AwaitableGroup | Exclude<Awaitable, undefined>>(
    awaitable: A
  ): AwaitableData<A>;
};

export type LoadableFn = {
  <T extends AwaitableGroup | Exclude<Awaitable, undefined> | undefined>(
    awaitable: T
  ): LoadableFnResult<NonNullable<T>>;
};

export type LoadableFnResult<T> = T extends Awaitable<infer D>
  ? Loadable<D>
  : NonNullable<T> extends AwaitableGroup
  ? {
      [key in keyof T]: T[key] extends Awaitable<infer D>
        ? Loadable<D>
        : Loadable<T[key]>;
    }
  : never;

export type AwaitableData<T> = T extends Awaitable<infer D>
  ? D
  : T extends AwaitableGroup
  ? { [key in keyof T]: T[key] extends Awaitable<infer D> ? D : T[key] }
  : never;

type ResolvedData = {
  promise?: AsyncResult<any>;
  data?: any;
  error?: any;
  key: any;
};

export type MaybePromise<T> = PromiseLike<T> | T;

export type ChainResult<T> = T extends PromiseLike<any>
  ? T
  : T extends Record<string, any>
  ? {
      [key in keyof T]: Extract<T[key], MaybePromise<any>> extends MaybePromise<
        infer D
      >
        ? D
        : T[key];
    }
  : T;

export type ChainFunc<P, R> = (
  payload: P extends { catch: (error: any) => infer C }
    ? { catch: C } | Omit<ChainResult<P>, "catch">
    : ChainResult<P>
) => R;

export type AsyncChainFn = {
  <R1, R2>(initial: R1, f2: ChainFunc<R1, R2>): AsyncResult<ChainResult<R2>>;

  <R1, R2, R3>(
    initial: R1,
    f2: ChainFunc<R1, R2>,
    f3: ChainFunc<R2, R3>
  ): AsyncResult<ChainResult<R3>>;

  <R1, R2, R3, R4>(
    initial: R1,
    f2: ChainFunc<R1, R2>,
    f3: ChainFunc<R2, R3>,
    f4: ChainFunc<R3, R4>
  ): AsyncResult<ChainResult<R4>>;

  <R1, R2, R3, R4, R5>(
    initial: R1,
    f2: ChainFunc<R1, R2>,
    f3: ChainFunc<R2, R3>,
    f4: ChainFunc<R3, R4>,
    f5: ChainFunc<R4, R5>
  ): AsyncResult<ChainResult<R5>>;

  <R1, R2, R3, R4, R5, R6>(
    initial: R1,
    f2: ChainFunc<R1, R2>,
    f3: ChainFunc<R2, R3>,
    f4: ChainFunc<R3, R4>,
    f5: ChainFunc<R4, R5>,
    f6: ChainFunc<R4, R6>
  ): AsyncResult<ChainResult<R6>>;

  <R1, R2, R3, R4, R5, R6, R7>(
    initial: R1,
    f2: ChainFunc<R1, R2>,
    f3: ChainFunc<R2, R3>,
    f4: ChainFunc<R3, R4>,
    f5: ChainFunc<R4, R5>,
    f6: ChainFunc<R4, R6>,
    f7: ChainFunc<R4, R7>
  ): AsyncResult<ChainResult<R7>>;

  <R1, R2, R3, R4, R5, R6, R7, R8>(
    initial: R1,
    f2: ChainFunc<R1, R2>,
    f3: ChainFunc<R2, R3>,
    f4: ChainFunc<R3, R4>,
    f5: ChainFunc<R4, R5>,
    f6: ChainFunc<R4, R6>,
    f7: ChainFunc<R4, R7>,
    f8: ChainFunc<R4, R8>
  ): AsyncResult<ChainResult<R8>>;
};

const ASYNC_RESULT_PROP = Symbol("ezmodel.asyncResult");
const DEFER_PROP = Symbol("ezmodel.defer");

const resolveData = (key: any, value: any): ResolvedData => {
  // resolve promise
  if (isPromiseLike(value)) {
    const ar = async(value);
    if (ar.loading) {
      return { key, promise: ar };
    }
    return { key, data: ar.data, error: ar.error };
  }

  // resolve factory
  if (typeof value === "function") {
    try {
      return resolveData(key, value());
    } catch (ex) {
      return { key, error: ex };
    }
  }

  // resolve model
  if (value && typeof value === "object") {
    const api = getModelApi(value);

    if (api) {
      return resolveData(key, api.initPromise ?? async(undefined));
    }
  }

  // resolve normal value
  return { key, data: value };
};

export const resolveAwaitable = (
  awaitable: any,
  resolveSingle: (item: ResolvedData) => any,
  resolveMultiple: (
    result: any,
    loading: (ResolvedData & { promise: AsyncResult<any> })[],
    resolved: ResolvedData[]
  ) => any,
  onSuccess?: AnyFunc | null,
  onError?: AnyFunc
) => {
  if (!awaitable) {
    throw new Error("Awaitable object must be not null or undefined");
  }

  const resolve = () => {
    if (
      isPromiseLike(awaitable) ||
      typeof awaitable === "function" ||
      (awaitable && typeof awaitable === "object" && getModelApi(awaitable))
    ) {
      return resolveSingle(resolveData(null, awaitable));
    }

    const keys = Object.keys(awaitable);
    const result: any = Array.isArray(awaitable) ? [] : {};
    const loading: (ResolvedData & { promise: AsyncResult<any> })[] = [];
    const resolved: ResolvedData[] = [];

    keys.forEach((key) => {
      const item = resolveData(key, awaitable[key]);
      if (item.promise) {
        loading.push(item as any);
      } else {
        resolved.push(item);
      }
    });

    return resolveMultiple(result, loading, resolved);
  };

  if (onSuccess || onError) {
    const snapshot = scope();
    const resolved = resolve() as AsyncResult<any>;
    try {
      if (resolved.error) {
        if (onError) {
          return async(snapshot(() => onError(resolved.error)));
        }
      } else if (!resolved.loading) {
        if (onSuccess) {
          return async(snapshot(() => onSuccess(resolved.data)));
        }
      } else {
        return async(
          resolved.then(
            onSuccess && ((value) => snapshot(() => onSuccess(value))),
            onError && ((error) => snapshot(() => onError(error)))
          )
        );
      }
    } catch (ex) {
      return async.reject(ex);
    }
    return resolved;
  }

  return resolve();
};

const resolveAsyncItem = (item: ResolvedData) => {
  if (item.promise) {
    return scope(item.promise);
  }
  if (item.error) {
    return scope(async.reject(item.error));
  }
  return scope(asyncResult(item.data));
};

export const race: RaceFn = (
  awaitable: any,
  onSuccess?: AnyFunc | null,
  onError?: AnyFunc
) => {
  let done = false;
  return resolveAwaitable(
    awaitable,
    resolveAsyncItem,
    (result, loading, resolved) => {
      // handle first resolved item if any
      if (resolved.length) {
        const first = resolved[0];
        if (first.error) {
          return async.reject(first.error);
        }

        result[first.key] = first.data;
        return asyncResult(result);
      }

      const promises = loading.map(({ promise, key }) =>
        promise.then((value) => {
          if (!done) {
            done = true;
            result[key] = value;
          }
        })
      );

      return async(Promise.race(promises).then(() => result));
    },
    onSuccess,
    onError
  );
};

export const all: AllFn = (
  awaitable: any,
  onSuccess?: AnyFunc | null,
  onError?: AnyFunc
) => {
  return resolveAwaitable(
    awaitable,
    resolveAsyncItem,
    (result, loading, resolved) => {
      for (const item of resolved) {
        // has any error
        if (item.error) {
          return async.reject(item.error);
        }
        result[item.key] = item.data;
      }

      const promises = loading.map(({ promise, key }) =>
        promise.then((value) => {
          result[key] = value;
        })
      );

      // not fulfilled
      if (promises.length) {
        return async(Promise.all(promises).then(() => result));
      }

      // fulfilled
      return async(result);
    },
    onSuccess,
    onError
  );
};

export const wait: WaitFn = (awaitable: any) => {
  const resolveItem = (item: ResolvedData) => {
    if (item.promise) {
      trackable()?.add(item.promise);

      throw item.promise;
    }

    if (item.error) {
      throw item.error;
    }

    return item.data;
  };

  return resolveAwaitable(
    awaitable,
    resolveItem,
    (result, loading, resolved) => {
      // should handle resolved items first, then loading items
      resolved.forEach((item) => {
        result[item.key] = resolveItem(item);
      });

      loading.forEach((item) => {
        result[item.key] = resolveItem(item);
      });

      return result;
    }
  );
};

export const loadable: LoadableFn = (awaitable: any) => {
  if (typeof awaitable === "undefined" || awaitable === null) {
    return {};
  }

  const track = trackable()?.add;

  const resolveItem = (item: ResolvedData) => {
    if (item.promise) {
      track?.(item.promise);
      return item.promise;
    }

    return { error: item.error, data: item.data };
  };

  return resolveAwaitable(
    awaitable,
    resolveItem,
    (result, loading, resolved) => {
      loading.forEach((item) => {
        result[item.key] = resolveItem(item);
      });

      resolved.forEach((item) => {
        result[item.key] = resolveItem(item);
      });

      return result;
    }
  );
};

const asyncResultProps = <T = any>(
  promise: Promise<T>,
  initialLoading: boolean,
  initialData: any,
  initialError: any
): AsyncResult<T> => {
  if ((promise as any)[ASYNC_RESULT_PROP]) {
    return promise as unknown as AsyncResult<T>;
  }

  if (typeof (promise as any).cancel !== "function") {
    (promise as any).cancel = NOOP;
  }

  const ar = Object.assign(promise, {
    [ASYNC_RESULT_PROP]: true,
    loading: initialLoading,
    error: initialError,
    data: initialData,
    on(listener: AnyFunc) {
      if (!ar.loading) return NOOP;

      let active = true;
      promise.finally(() => {
        if (!active) {
          return;
        }
        listener();
      });

      return () => {
        active = false;
      };
    },
  });

  if (ar.loading) {
    if ((ar as any)[DEFER_PROP]) {
      // no need to handle success and error status, defer logic already handles
    } else {
      ar.then(
        (result) => {
          ar.data = result;
          ar.loading = false;
        },
        (e) => {
          ar.error = e;
          ar.loading = false;
        }
      );
    }
  }

  return ar as any;
};

export type AsyncFn = {
  <T = any>(value: T | Promise<T>): AsyncResult<T>;

  reject: (reason: any) => AsyncResult<any>;

  func: <T>(
    asyncImport: () => Promise<T>
  ) => T extends AnyFunc ? T : T extends { default: infer F } ? F : never;

  map<T, V>(
    value: V,
    mapper: (awaited: Awaited<V>, sync: boolean) => Awaited<T>
  ): V extends Promise<any> ? AsyncResult<T> : T;

  defer: typeof createDefer;
};

export const createDefer = <T>(
  fn?: (resolve: (value: T) => void, reject: (reason: unknown) => void) => void
): Defer<T> => {
  let resolve: AnyFunc | undefined;
  let reject: AnyFunc | undefined;

  const promise = new Promise<T>((...args: any[]) => {
    [resolve, reject] = args;
    fn?.(args[0], args[1]);
  });

  return async(
    Object.assign(promise, {
      defer: true,
      [DEFER_PROP]: true,
      resolve(data: T) {
        Object.assign(promise, { loading: false, data });
        resolve?.(data);
      },
      reject(error: unknown) {
        Object.assign(promise, { loading: false, error });
        reject?.(error);
      },
    })
  ) as any;
};

const asyncResult = <T>(value: T | Promise<T>): AsyncResult<T> => {
  if (!isPromiseLike(value)) {
    return asyncResultProps(Promise.resolve(value), false, value, undefined);
  }

  return asyncResultProps<T>(value, true, undefined, undefined);
};

export const async: AsyncFn = Object.assign(
  (...args: any[]) => {
    // OVERLOAD: async(value)
    return asyncResult(args[0]);
  },
  {
    map(value: any, mapper: (value: any, sync: boolean) => any): any {
      if (isPromiseLike(value)) {
        const ar = async(value);
        if (ar.error) return ar;
        if (ar.loading) {
          return async(value.then((awaited) => mapper(awaited, false)));
        }
        try {
          return async(mapper(ar.data, false));
        } catch (ex) {
          return async.reject(ex);
        }
      }
      return mapper(value, true);
    },
    reject(reason: any) {
      if (isPromiseLike(reason)) {
        return asyncResult(reason);
      }

      return asyncResultProps(
        Promise.reject(reason).catch(NOOP),
        false,
        undefined,
        reason
      );
    },
    func<T>(
      asyncImport: () => Promise<T>
    ): T extends AnyFunc ? T : T extends { default: infer F } ? F : never {
      let p: Promise<AnyFunc> | undefined;

      return ((...args: any[]) => {
        if (!p) {
          p = asyncImport().then((value: any) => {
            if (typeof value === "function") {
              return value;
            }

            if (typeof value?.default === "function") {
              return value.default;
            }

            return ASYNC_FUNCTION_CANNOT_BE_LOADED;
          });
        }

        return p.then((x) => x(...args));
      }) as any;
    },
    defer: createDefer,
  }
);

const ASYNC_FUNCTION_CANNOT_BE_LOADED = () => {
  throw new Error("Cannot load async function");
};

export const delay = (ms = 0) => {
  let timeoutId: any;
  const cc = cancellable();
  return Object.assign(
    new Promise<void>((resolve, reject) => {
      timeoutId = setTimeout(
        () => {
          const e = cc?.error;

          if (e) {
            reject(e);
          } else {
            resolve(e);
          }
        },
        ms,
        true
      );
    }),
    {
      cancel() {
        clearTimeout(timeoutId);
      },
    }
  );
};
