import { getOwnPropertyDescriptors } from "./getOwnPropertyDescriptors";
import { DescriptorMap } from "./internal";

export const createObjectFromDescriptors = (descriptors: DescriptorMap) => {
  const obj = {};
  Object.defineProperties(obj, descriptors);
  return obj;
};

export const copyObject = <T extends {}>(source: T): T => {
  return createObjectFromDescriptors(getOwnPropertyDescriptors(source)) as T;
};
