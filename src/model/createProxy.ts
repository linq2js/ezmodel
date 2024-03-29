import { DescriptorMap, PropGetter } from "../internal";
import { Dictionary } from "../types";

export const createProxy = (
  isDynamic: boolean,
  descriptors: DescriptorMap,
  getProp: PropGetter,
  setProp?: (prop: string | symbol, value: any) => boolean
) => {
  const target = {};
  const toJSON = () => {
    const result: Dictionary = {};
    Object.keys(descriptors).forEach((key) => {
      const value = getProp(key).get();
      if (typeof value !== "function") {
        result[key] = value;
      }
    });
    return result;
  };
  const toString = () => {
    return `ModelProxy:${JSON.stringify(toJSON())}`;
  };

  return new Proxy(target, {
    get(_, prop) {
      if (prop === "toJSON") {
        return toJSON;
      }
      if (prop === "toString") {
        return toString;
      }
      return getProp(prop).get();
    },
    set(_, p, value) {
      if (!setProp) return false;
      return setProp(p, value);
    },
    deleteProperty() {
      return false;
    },
    ownKeys(_) {
      return Object.keys(descriptors)
        .map((prop) => {
          const type = getProp(prop).type;
          if (type === "private") {
            return "";
          }

          if (type === "undefined" && !isDynamic) {
            return "";
          }

          return prop;
        })
        .filter((x) => !!x);
    },
    getOwnPropertyDescriptor(_, p) {
      if (typeof p !== "string") {
        return undefined;
      }
      return descriptors[p];
    },
    has(_, p) {
      const type = getProp(p).type;
      return type !== "private" && type !== "undefined";
    },
    /**
     * this trick to prevent immer tries to make a copy of nested models
     * ```js
     * const child = model({ name: 'Ging' })
     * const parent = model({ child })
     *
     * // perform mutation on child
     * parent.child.name = 'New name' // without this trick immer will create a copy of child
     * ```
     * @returns
     */
    getPrototypeOf() {
      return target;
    },
  });
};
