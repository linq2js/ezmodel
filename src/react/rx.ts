import { ReactElement, createElement, memo, useState } from "react";
import { AnyFunc } from "../types";
import { trackable } from "..";
import { useRerender } from "./useRerender";
import { NOOP } from "~/utils";

const Part = memo(({ fn }: { fn: AnyFunc }): any => {
  const rerender = useRerender();
  const ref = useState(() => ({
    fn: NOOP as AnyFunc,
    untrack: NOOP,
    error: undefined as any,
    result: undefined as any,
  }))[0];

  if (ref.fn !== fn) {
    ref.untrack();
    ref.fn = fn;
    let currentRererender = NOOP;
    const handleChange = () => {
      try {
        ref.result = fn();
      } catch (ex) {
        ref.error = ex;
      }
      currentRererender();
    };
    const { track } = trackable(handleChange)[0];
    ref.untrack = track(() => {
      currentRererender = rerender;
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
});

export const rx = <T>(fn: () => T): ReactElement => {
  return createElement(Part, { fn });
};
