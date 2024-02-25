import { alter } from "./alter";
import { Defer, async } from "../async";
import { createModel } from "./createModel";
import { getModelApi } from "../getModelApi";
import { getOwnPropertyDescriptors } from "../getOwnPropertyDescriptors";

import {
  AnyFunc,
  Model,
  ModelKey,
  ModelLoader,
  ModelOptions,
  ModelType,
  NoInfer,
  StateBase,
} from "../types";
import { isPromiseLike } from "../utils";

export type ModelTypeOptions<TState> = ModelOptions<TState> & {
  key?: keyof TState;
  fetch?: ModelLoader<TState | undefined>;
};

export const createModelType = <TState extends StateBase>(
  options?: ModelTypeOptions<NoInfer<TState>>
) => {
  const { key: keyProp = "id", fetch: defaultFetch } = options ?? {};
  const extraPropsBuilders: any[] = [];
  const defaultInits = new Set<VoidFunction>();
  const models = new Map<ModelKey, Model<any>>();
  const lazyModels = new Map<ModelKey, Defer<any>>();

  const getKey = (props: any) => {
    const key = props[keyProp];
    if (!key) {
      throw new Error(`The typed model must have ${keyProp as string} prop`);
    }
    return key;
  };

  const create = (props: TState): any => {
    const key = getKey(props);
    // make sure all getters invoked
    const values = { ...props };
    const cachedModel = models.get(key);

    if (cachedModel) {
      delete values[keyProp];
      getModelApi(cachedModel)?.configure(values, "all");
      lazyResolve(key, cachedModel);
      return cachedModel;
    }

    Object.defineProperty(values, keyProp, {
      get() {
        return key;
      },
      set() {
        throw new Error("Modifying the key of a typed model is not allowed.");
      },
    });

    const newModel = createModel(
      "normal",
      (proxy) => {
        const runtimeDescriptors = getOwnPropertyDescriptors(values);

        if (extraPropsBuilders.length) {
          const mergedDescriptors = {
            ...runtimeDescriptors,
          };
          const runtimeInits = new Set<AnyFunc>();

          extraPropsBuilders.forEach((extra) => {
            const props = typeof extra === "function" ? extra(proxy) : extra;
            const { init, ...descriptors } = getOwnPropertyDescriptors(props);
            if (init && typeof init.value === "function") {
              runtimeInits.add(init.value);
            }
            Object.assign(mergedDescriptors, descriptors);
          });

          defaultInits.forEach((init) => runtimeInits.add(init));

          const temp = {};

          if (runtimeInits.size) {
            Object.assign(temp, {
              init() {
                const model = this;
                const disposeFunctions: VoidFunction[] = [];
                runtimeInits.forEach((init) => {
                  const result = init.call(model, model);
                  if (typeof result === "function") {
                    disposeFunctions.push(result);
                  }
                });
                if (disposeFunctions.length) {
                  return () => {
                    disposeFunctions.forEach((dispose) => dispose());
                  };
                }
              },
            });
          }

          Object.defineProperties(temp, mergedDescriptors);

          return [temp, mergedDescriptors];
        }

        return [values, runtimeDescriptors];
      },
      {
        ...(options as any),
        ref: { ...options?.ref, key },
        type: modelType,
      }
    );

    models.set(key, newModel);
    lazyResolve(key, newModel);

    return newModel;
  };

  const lazyResolve = (key: ModelKey, model: Model<any>) => {
    const lazyModel = lazyModels.get(key);

    if (lazyModel) {
      lazyModels.delete(key);
      lazyModel.resolve(model);
    }
  };

  const lazyFetch = (
    key: ModelKey,
    customFetch?: ModelLoader<TState | undefined>
  ): Model<any> | undefined => {
    const fetch = customFetch || defaultFetch;
    if (!fetch) return;

    const result = fetch?.(key);
    if (isPromiseLike<TState>(result)) {
      const ar = async(result);
      if (ar.loading) {
        result.then(
          (resolved: TState | undefined) => {
            if (!resolved) return;
            create(resolved);
          },
          (_) => {
            // TODO: handle error
          }
        );
      }

      if (ar.data) {
        return create(ar.data);
      }
    } else if (result) {
      return create(result as TState);
    }
  };

  const modelType: ModelType<TState, {}, false> = Object.assign(
    (props: TState | TState[]): any => {
      if (Array.isArray(props)) {
        return props.map(create);
      }

      return create(props);
    },
    {
      type: "modelType" as const,
      size: 0,
      load(loader: () => Promise<TState | TState[]>) {
        const result = loader();

        if (!isPromiseLike<TState | TState[]>(result)) {
          throw new Error("Loader must return promise object");
        }

        return async.map(result, (resolved) => {
          if (Array.isArray(resolved)) return resolved.map(create);
          return create(resolved);
        });
      },
      with(input: any): any {
        extraPropsBuilders.push(input);
        return this;
      },
      strict() {
        return modelType;
      },
      init(fn: AnyFunc): any {
        defaultInits.add(fn);
        return this;
      },
      each(callback: AnyFunc, filter?: AnyFunc): any {
        if (filter) {
          models.forEach((model) => {
            if (filter(model)) {
              callback(model);
            }
          });
        } else {
          models.forEach(callback);
        }
      },
      clear() {
        models.clear();
      },
      get(key: any, loader?: unknown, staleWhileRevalidate?: boolean): any {
        // OVERLOAD: get(key, defaultState)
        if (loader && typeof loader === "object") {
          const cached = models.get(key);
          return cached ?? create(loader as TState);
        }

        // OVERLOAD: get(key, loader, cacheFirst)
        if (typeof loader === "function") {
          if (!staleWhileRevalidate) {
            const cached = models.get(key);
            if (cached) return async(cached);
            return async.map(loader(key), create);
          }

          // execute loader then update latest
          const result: Promise<TState> | TState = loader(key);
          // result is model state
          if (!isPromiseLike(result)) {
            return async(create(result));
          }

          const cached = models.get(key);
          if (!cached) {
            return async.map(result, create);
          }

          // update model later
          result.then(create);

          return async(cached);
        }

        return models.get(key);
      },
      alter(key: any, propsOrRecipe: unknown): any {
        const updatedModels: Model<any>[] = [];

        if (typeof key === "function") {
          const filter = key;
          models.forEach((model) => {
            if (filter(model)) {
              updatedModels.push(model);
            }
          });
        } else if (Array.isArray(key)) {
          key.forEach((k) => {
            const model = models.get(k);
            if (model) {
              updatedModels.push(model);
            }
          });
        } else {
          const model = models.get(key);
          if (model) {
            updatedModels.push(model);
          }
        }

        updatedModels.forEach((model) => {
          if (typeof propsOrRecipe === "function") {
            alter(() => propsOrRecipe(model));
          } else {
            alter(model, propsOrRecipe as any);
          }
        });

        return updatedModels;
      },
      from(value: any) {
        if (isPromiseLike(value)) {
          return async.map(value, (resolved) => {
            if (Array.isArray(resolved)) return resolved.map(create);
            return create(resolved as TState);
          });
        }
        if (Array.isArray(value)) {
          return value.map(create);
        }

        return create(value);
      },

      lazy(input: any, customFetch?: AnyFunc): any {
        if (typeof input === "undefined" || input === null) {
          throw new Error("Model key or model props required");
        }

        // the input is default props
        if (typeof input === "object") {
          const key = getKey(input);
          let model = models.get(key);
          if (model) {
            return model;
          }

          return (
            // return resolved model if fetch function is sync
            lazyFetch(key, customFetch) ??
            // otherwise create temp model
            create(input)
          );
        }

        const key = input;
        let lazyModel = lazyModels.get(key);
        if (!lazyModel) {
          lazyModel = async.defer();
          lazyModels.set(key, lazyModel);
        }

        const fetchedModel = lazyFetch(key, customFetch);
        // return resolved model if fetch function is sync
        if (fetchedModel) {
          return async(fetchedModel);
        }

        return lazyModel;
      },
      isLoading(model: unknown) {
        if (!model) return false;

        let key: ModelKey;

        try {
          key = getKey(model);
        } catch (ex) {
          return false;
        }

        return !!lazyModels.get(key);
      },
    }
  );

  Object.defineProperties(modelType, {
    size: { get: () => models.size },
  });

  return modelType;
};
