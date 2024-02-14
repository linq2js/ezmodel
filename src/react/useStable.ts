import { useEffect, useMemo, useRef, useState } from "react";

import { NoInfer } from "../types";

export type UseStable = {
  <T extends Record<string | number | symbol, any>>(unstable: T): Readonly<
    Omit<T, "onInit" | "onMount" | "onUnmount">
  >;
  <S, T extends Record<string | number | symbol, any>>(
    initialState: S,
    unstable: (state: NoInfer<S>) => T
  ): Readonly<Omit<T & S, "onInit" | "onMount" | "onUnmount">>;
};

const useStable: UseStable = (...args: any[]) => {
  const initializedRef = useRef(false);
  const rerender = useState({})[1];
  let unstableFn: (state: Record<any, any>) => Record<any, any>;
  let initialState: Record<string, any>;
  // useStable(state, unstable)
  if (args.length > 1) {
    [initialState, unstableFn] = args;
  } else {
    const unstable = args[0];
    [initialState, unstableFn] = [{}, () => unstable];
  }

  const { state, update } = useMemo(() => {
    let initialState: any;
    const prevState: any = {};

    return {
      state: createObjectProxy(
        () => prevState,
        (prop: any) => {
          return prevState[prop];
        },
        (prop: any, value: any) => {
          if (value !== prevState[prop]) {
            prevState[prop] = value;
            rerender({});
          }
          return true;
        }
      ),
      update: (newState: any = {}) => {
        if (!initialState) {
          initialState = newState;
          Object.assign(prevState, initialState);
        } else {
          Object.keys(newState ?? {}).forEach((key) => {
            const value = newState[key];
            // update current state if initial state changed
            if (newState[key] !== initialState[key]) {
              initialState[key] = value;
              prevState[key] = value;
            }
          });
        }
      },
    };
  }, []);

  update(initialState);

  const unstable = unstableFn(state);
  const unstableRef = useRef(unstable);
  unstableRef.current = unstable;

  const stable = useState(() => {
    const cache = new Map<any, Function>();

    return createObjectProxy(
      () => unstableRef.current,
      (prop: any) => {
        if (prop in initialState) {
          return state[prop];
        }

        const value = unstableRef.current[prop];

        if (typeof value === "function") {
          let cachedFn = cache.get(prop);
          if (!cachedFn) {
            cachedFn = (...args: any[]) => unstableRef.current[prop](...args);
            cache.set(prop, cachedFn);
          }
          return cachedFn;
        }
        return value;
      }
    );
  })[0];

  useEffect(() => {
    stable.onMount?.();
    return () => {
      stable.onUnmount?.();
    };
  }, [stable]);

  if (!initializedRef.current) {
    initializedRef.current = true;
    stable.onInit?.();
  }

  return stable;
};

const createObjectProxy = (
  getTarget: () => any,
  get: (key: any) => any,
  set?: (key: any, value: any) => boolean
) => {
  return new Proxy({} as any, {
    get: (_, key) => get(key),
    set: set ? (_, key, value) => set(key, value) : undefined,
    ownKeys(_) {
      return Object.keys(getTarget());
    },
    getOwnPropertyDescriptor(_, key) {
      return {
        value: get(key),
        enumerable: true,
        configurable: true,
      };
    },
  });
};

export { useStable };
