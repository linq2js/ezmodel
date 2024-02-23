import { ReactElement, createElement, memo, useRef } from "react";
import { AnyFunc } from "../types";
import { trackable } from "..";
import { useRerender } from "./useRerender";

const Part = memo((props: { fn: AnyFunc }) => {
  const rerender = useRerender();
  const untrackRef = useRef<VoidFunction>();

  untrackRef.current?.();
  const [{ track }, result] = trackable(props.fn);
  untrackRef.current = track(rerender);

  return result;
});

export const rx = <T>(fn: () => T): ReactElement => {
  return createElement(Part, { fn });
};
