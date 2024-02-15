import { Tag } from "./types";

export const tag = <T = any>(init?: Tag<T>["init"]): Tag<T> => {
  const models = new Set<T>();

  return {
    type: "tag",
    get count() {
      return models.size;
    },
    get all() {
      return Array.from(models);
    },
    init(model) {
      models.add(model);
      return init?.(model);
    },
    each(callback) {
      models.forEach(callback);
    },
  };
};
