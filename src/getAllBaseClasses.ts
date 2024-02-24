import { AnyFunc } from "./types";

const baseClassCache = new WeakMap<object, AnyFunc[]>();

export const getAllBaseClasses = (cls: any) => {
  let bases = baseClassCache.get(cls);
  if (!bases) {
    bases = [];

    let current = cls;

    // Traverse the prototype chain
    while (current) {
      let base = Object.getPrototypeOf(current);
      if (base && base !== Function.prototype && base.name) {
        bases.unshift(base);
      }
      current = base;
    }

    baseClassCache.set(cls, bases);
  }

  return bases;
};
