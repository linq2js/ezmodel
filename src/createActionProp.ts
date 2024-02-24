import { async } from "./async";
import { emitter } from "./emitter";
import { ActionProp } from "./internal";
import { trackable } from "./trackable";
import { AnyFunc, AsyncResult } from "./types";
import { isPromiseLike } from "./utils";

export const createActionProp = <T, A extends any[]>(
  dispatch: (...args: A) => T,
  proxy: T
): ActionProp => {
  let prevResult: T | undefined;
  let current:
    | {
        count: number;
        args: A;
        result?: T;
        /**
         * dispatch error
         */
        error?: any;
      }
    | undefined;

  const onChange = emitter();
  const onDispatch = emitter<A>();

  const action = Object.assign(
    (...args: A) => {
      onDispatch.emit(args);
      current = { count: (current?.count ?? 0) + 1, args };
      try {
        current.result = dispatch.apply(proxy, args);
        if (isPromiseLike(current.result)) {
          current.result = async(current.result) as T;
        }
      } catch (ex) {
        current.error = ex;
      }

      prevResult = current.result;

      onChange.emit();
      if (current.error) {
        throw current.error;
      }
      return current.result;
    },
    {
      on: onDispatch.on,
      reload() {
        if (!current) return false;
        action(...current.args);
        return true;
      },
      load(...args: A) {
        if (current && current.args.every((x, i) => x === args[i])) {
          if (current.error) {
            throw current.error;
          }
          return current.result;
        }
        return action(...args);
      },
    }
  );

  const handleAsync = <A, S>(
    asyncResolver: (ar: AsyncResult) => A,
    syncResolver: (value: any, error: any) => S
  ): S | A => {
    const track = trackable()?.add;
    track?.(onChange);
    if (isPromiseLike(current?.result)) {
      const ar = async(current.result);
      if (ar.loading) {
        track?.(ar);
      }

      return asyncResolver(ar);
    }

    return syncResolver(current?.result, current?.error);
  };

  Object.defineProperties(action, {
    prevResult: {
      get() {
        return prevResult;
      },
    },
    called: {
      get() {
        trackable()?.add(onChange);
        return current?.count ?? 0;
      },
    },
    loading: {
      get() {
        return handleAsync(
          (ar) => ar.loading,
          () => false
        );
      },
    },
    awaited: {
      get() {
        return handleAsync(
          (ar) => ar.data,
          (data) => data
        );
      },
    },
    result: {
      get() {
        trackable()?.add(onChange);
        return current?.result;
      },
    },
    error: {
      get() {
        return handleAsync(
          (ar) => ar.error,
          (_, error) => error
        );
      },
    },
  });

  return {
    type: "action",
    get() {
      return action;
    },
    on: onChange.on,
    dispose() {
      onChange.clear();
    },
    setDispatcher(dispatcher: AnyFunc) {
      dispatch = dispatcher;
    },
  };
};
