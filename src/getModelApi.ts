import { MODEL_TYPE, ModelApi } from "./internal";
import { raw } from "./utils";

export const getModelApi = (value: any) => {
  return raw(value)?.[MODEL_TYPE] as ModelApi | undefined;
};
