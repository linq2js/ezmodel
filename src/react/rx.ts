"use client";

import { ReactElement, createElement, memo } from "react";
import { AnyFunc } from "../types";
import { useComputed } from "./useComputed";

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
