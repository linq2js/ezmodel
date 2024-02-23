import { useEffect, useMemo, useState } from "react";
import { effect } from "../effect";
import { Equal, NoInfer } from "../types";
import { useRerender } from "./useRerender";

export const useComputed = <T>(
  fn: () => T,
  equal: Equal<NoInfer<T>> = Object.is
): T => {
  const rerender = useRerender();
  const ref = useState(() => ({
    unwatch: undefined as VoidFunction | undefined,
    error: undefined as any,
    prev: undefined as any,
  }))[0];

  const handleEffect = (force?: boolean) => {
    if (!force && ref.unwatch) {
      return;
    }
    ref.unwatch?.();
    ref.unwatch = effect(({ count }) => {
      try {
        const next = fn();
        const isFirstRun = !count;
        // change prev result to next result at first time or if it does not equal to next result
        if (isFirstRun) {
          ref.prev = next;
        } else if (!equal(ref.prev, next)) {
          ref.prev = next;
          rerender();
        }
      } catch (ex) {
        ref.unwatch?.();
        ref.unwatch = undefined;
        ref.error = ex;
        rerender();
      }
    });
  };

  useMemo(() => {
    handleEffect(true);
  }, [fn, equal]);

  useEffect(() => {
    handleEffect();

    return () => {
      ref.unwatch?.();
      ref.unwatch = undefined;
    };
  }, []);

  if (ref.error) {
    const error = ref.error;
    ref.error = undefined;
    throw error;
  }

  return ref.prev;
};
