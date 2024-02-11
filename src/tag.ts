export type ModelTag<T> = {
  readonly type: "tag";
  readonly count: number;
  readonly all: T[];
  init: (model: T) => any;
  each(callback: (model: T) => void): void;
};

export const tag = <T = any>(init?: ModelTag<T>["init"]): ModelTag<T> => {
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
