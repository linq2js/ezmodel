import { ValueProp } from "~/internal";

export const createModelField = <T>(
  getState: () => T,
  save?: VoidFunction
): ValueProp => {
  let prev: { value: T } | undefined;

  return {
    type: "value",
    get() {
      if (!prev) {
        prev = { value: getState() };
      }
      return prev.value;
    },
    set(value) {
      if (prev && prev.value === value) return;
      prev = { value };
      save?.();
    },
  };
};
