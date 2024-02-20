import { scope } from "./scope";

export const propAccessor = scope(() => ({
  type: "previous" as "previous" | "original" | "peek",
}));

export const previous = <T>(fn: () => T): T => {
  const [, result] = propAccessor(fn, (x) => (x.type = "previous"));
  return result;
};

export const original = <T>(fn: () => T): T => {
  const [, result] = propAccessor(fn, (x) => (x.type = "original"));
  return result;
};

export const peek = <T>(fn: () => T): T => {
  const [, result] = propAccessor(fn, (x) => (x.type = "peek"));
  return result;
};
