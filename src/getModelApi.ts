import { MODEL_TYPE, ModelApi } from "./internal";

export const getModelApi = (value: any) => {
  return value?.[MODEL_TYPE] as ModelApi | undefined;
};
