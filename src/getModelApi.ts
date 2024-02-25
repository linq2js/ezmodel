import { MODEL_TYPE, ModelApi } from "./internal";
import { raw } from "./utils";

/**
 * Return the model API if the value is "model"; otherwise, return undefined.
 * @param value
 * @returns
 */
export const getModelApi = (value: any) => {
  return raw(value)?.[MODEL_TYPE] as ModelApi | undefined;
};
