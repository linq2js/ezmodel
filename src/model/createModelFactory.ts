import { createModel, dispose } from "./createModel";
import { getModelApi } from "../getModelApi";
import { getOwnPropertyDescriptors } from "../getOwnPropertyDescriptors";
import { ModelKind } from "../internal";
import { local } from "../local";
import { AnyFunc, Dictionary, ModelOptions } from "../types";
import { isClass } from "../utils";

export const createModelFactory =
  (kind: ModelKind) =>
  (init: Dictionary | AnyFunc, options?: ModelOptions<any>) => {
    const constructor =
      typeof init === "function"
        ? isClass(init)
          ? () => {
              const instance = new (init as any)();
              return [instance, getOwnPropertyDescriptors(init)] as const;
            }
          : () => {
              const instance = init();
              return [instance, getOwnPropertyDescriptors(instance)] as const;
            }
        : () => [init, getOwnPropertyDescriptors(init)] as const;

    // handle local model creation
    const localModel = local()?.get("model", () => {
      const s = createModel(kind, constructor, options);

      return {
        value: s,
        dispose() {
          dispose(s);
        },
      };
    });

    if (localModel) {
      if (typeof init !== "function") {
        getModelApi(localModel.value)?.configure(init, options?.unstable);
      }
      return localModel.value as any;
    }

    return createModel(kind, constructor, options);
  };
