import { ReactElement, createElement, memo, useState } from "react";
import { AnyFunc, Equal, NoInfer } from "../types";
import { trackable } from "..";
import { useRerender } from "./useRerender";
import { NOOP } from "~/utils";

/**
 * @param fn
 * @param equal
 * @returns
 */
export const useComputed = <T>(
  fn: () => T,
  equal: Equal<NoInfer<T>> = Object.is
): T => {
  const rerender = useRerender();
  const ref = useState(() => ({
    fn: NOOP as AnyFunc,
    untrack: NOOP,
    error: undefined as any,
    hasResult: false,
    result: undefined as any,
  }))[0];

  if (ref.fn !== fn) {
    ref.untrack();
    ref.fn = fn;
    let tryRererender = NOOP;
    const handleChange = () => {
      try {
        const nextResult = fn();
        if (ref.hasResult && equal(ref.result, nextResult)) {
          return;
        }
        ref.result = nextResult;
        ref.hasResult = true;
      } catch (ex) {
        ref.error = ex;
      }
      tryRererender();
    };
    const { track } = trackable(handleChange)[0];
    ref.untrack = track(() => {
      tryRererender = rerender;
      handleChange();
    });
  }

  if (ref.error) {
    ref.untrack();
    ref.fn = NOOP;
    const error = ref.error;
    ref.error = undefined;
    throw error;
  }

  return ref.result;
};

const Part = memo(({ fn }: { fn: AnyFunc }): any => {
  return useComputed(fn);
});

/**
 * Return a React element designed to re-render when any reactive expression within the `fn` function changes, ensuring that these changes do not affect the parent component.
 * @param fn
 * @returns
 */
export const rx = <T>(fn: () => T): ReactElement => {
  return createElement(Part, { fn });
};
