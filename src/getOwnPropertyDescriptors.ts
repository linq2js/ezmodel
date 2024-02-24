import { getAllBaseClasses } from "./getAllBaseClasses";
import { DescriptorMap } from "./internal";
import { AnyFunc } from "./types";
import { isClass } from "./utils";

const descriptorCache = new WeakMap<object, DescriptorMap>();

export const getOwnPropertyDescriptors = (obj: any): DescriptorMap => {
  if (isClass(obj)) {
    let descriptors = descriptorCache.get(obj);
    if (!descriptors) {
      const classes = [...getAllBaseClasses(obj), obj as AnyFunc];
      const { constructor: _, ...classDescriptors } = classes.reduce(
        (prev: DescriptorMap, c) => {
          return {
            ...prev,
            ...Object.getOwnPropertyDescriptors(c.prototype),
          };
        },
        {}
      );
      descriptors = classDescriptors;
      descriptorCache.set(obj, descriptors);
    }

    return descriptors;
  }

  return Object.getOwnPropertyDescriptors(obj);
};
