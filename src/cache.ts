import { Model } from "./types";

export const createCache = () => {
  const models = new Map<string, Model<any>>();

  const clear = () => models.clear();

  const get = (key: string) => {
    return models.get(key);
  };

  const set = (key: string, model: Model<any>) => {
    models.set(key, model);
  };

  return { get, set, clear };
};

export const cache = createCache();
