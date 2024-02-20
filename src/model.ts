import { alter, getValue, setValue } from "./alter";
import { async } from "./async";
import { cancellable } from "./cancellable";
import { disposable } from "./disposable";
import { emitter } from "./emitter";
import { getModelApi } from "./getModelApi";
import {
  DescriptorMap,
  PropGetter,
  StateProp,
  Validator,
  MODEL_TYPE,
  NO_WRAP,
  StateBase,
  ActionProp,
  Prop,
  PropSetter,
  UnknownProp,
  ModelApi,
} from "./internal";
import { local } from "./local";
import { objectKeyedMap } from "./objectKeyedMap";
import { propAccessor } from "./propAccessor";
import { scope } from "./scope";
import { trackable } from "./trackable";
import {
  AnyFunc,
  AsyncResult,
  Listenable,
  NoInfer,
  NonFunctionProps,
  Model,
  Dictionary,
  ModelOptions,
  ModelType,
} from "./types";
import { NOOP, isClass, isPromiseLike } from "./utils";

export type DisposeFn = {
  <T extends StateBase>(models: T[]): void;
  <T extends StateBase>(model: T): void;
};

export type StaleFn = {
  <T extends StateBase>(model: T, notify: boolean): void;
  <T extends StateBase>(
    model: T,
    prop?: keyof NonFunctionProps<T>,
    notify?: boolean
  ): void;
  <T extends StateBase>(
    model: T,
    props?: (keyof NonFunctionProps<T>)[],
    notify?: boolean
  ): void;
  <T extends StateBase>(models: T[], notify?: boolean): void;
};

export type RefreshFn = {
  (when: Listenable | Listenable<any>[]): void;

  <T extends StateBase>(model: T, prop?: keyof NonFunctionProps<T>): void;
  <T extends StateBase>(model: T, props?: (keyof NonFunctionProps<T>)[]): void;
  <T extends StateBase>(models: T[]): void;
};

export type ReadonlyModel<T> = Model<Readonly<T>>;

export type State<T> = T extends () => infer R
  ? R
  : T extends new () => infer R
  ? R
  : T;

/**
 * model(base, initFn, options)
 * model(props, options)
 */

export type ModelFn = {
  strict: {
    <TInit>(init: TInit): ReadonlyModel<State<TInit>>;

    <TInit>(
      init: TInit,
      options: ModelOptions<State<NoInfer<TInit>>>
    ): ReadonlyModel<State<TInit>>;
  };

  <TInit>(init: TInit): Model<State<TInit>>;

  <TInit>(init: TInit, options: ModelOptions<State<NoInfer<TInit>>>): Model<
    State<TInit>
  >;

  type: typeof createModelType;
};

const createStateProp = <T>(
  descriptors: DescriptorMap,
  getState: () => T,
  computed: boolean,
  getProp: PropGetter,
  validate?: Validator,
  customSet?: (value: T) => void,
  save?: VoidFunction
): StateProp => {
  type EvaluateResult = { value: T } | { error: any };
  let current: EvaluateResult | undefined;
  let previous: EvaluateResult | undefined;
  let original: EvaluateResult | undefined;
  let thisObject: any;
  let isComputing = false;
  let isTracking = false;
  let cancelPrevious: VoidFunction | undefined;
  const onCleanup = emitter();
  const onChange = emitter();
  const dependencies = new Set<StateProp>();
  const onDependencyChange = () => {
    previous = current;
    current = undefined;
    onChange.emit();
  };

  const addDependency = (info: StateProp) => {
    if (!dependencies.has(info)) {
      dependencies.add(info);
      onCleanup.on(info.on(onDependencyChange));
    }
  };
  const recompute = () => {
    if (isComputing) return;
    isComputing = true;
    try {
      cancelPrevious?.();
      dependencies.clear();
      onCleanup.emit();
      onCleanup.clear();

      if (!thisObject) {
        thisObject = createModelProxy(
          descriptors,
          // custom get prop
          (prop) => {
            const info = getProp(prop);

            if (!isTracking && info.type === "state") {
              addDependency(info);
            }

            return info;
          }
        );
      }

      try {
        isTracking = true;
        const [
          {
            trackable: { onTrack },
            cancellable: { cancel },
          },
          result,
        ] = scope({ trackable, cancellable }, () => {
          let value = propAccessor.none(() => getState.call(thisObject));
          return { value };
        });
        current = result;
        cancelPrevious = cancel;
        onTrack((x) => {
          if ("$state" in x) {
            addDependency(x.$state as StateProp);
          } else {
            // normal listenable
            onCleanup.on(x.on(onDependencyChange));
          }
        });
      } catch (error) {
        current = { error };
      } finally {
        isTracking = false;
      }
    } finally {
      isComputing = false;
    }
  };

  const ensureValueReady = () => {
    if (current) return current;

    if (computed) {
      recompute();
      if (!current) {
        throw new Error("Something went wrong");
      }
    } else {
      try {
        let value = getState();
        current = { value };
      } catch (error) {
        current = { error };
      }
    }

    if (current && "value" in current) {
      if (isPromiseLike(current.value)) {
        current.value = async(current.value) as any;
      }
    }

    if (!original) {
      original = current;
      previous = original;
    }

    return current;
  };

  const valueOrError = (result: EvaluateResult) => {
    if ("error" in result) {
      throw result.error;
    }
    return result.value;
  };

  const get = () => {
    const accessor = propAccessor();
    current = ensureValueReady();

    if (accessor) {
      if (isComputing && accessor.type !== "peek") {
        return valueOrError(current);
      }

      if (!original) {
        original = current;
      }

      if (accessor.type === "original") {
        return valueOrError(original);
      }

      if (accessor.type === "previous") {
        if (!previous) {
          previous = original;
        }

        return valueOrError(previous);
      }
    }

    return valueOrError(current);
  };

  const set = (value: T) => {
    if (current && "value" in current && current.value === value) {
      return;
    }

    let shouldCheckIdentityAgain = false;

    if (validate) {
      value = async.map(value, (awaited) => {
        validate?.(awaited, (newValue) => {
          // if the validator is called in async thread, shouldCheckIdentityAgain = false and the checking below will be skipped
          shouldCheckIdentityAgain = true;
          awaited = newValue;
        });

        return awaited;
      });
    }

    // verify data duplication again
    if (shouldCheckIdentityAgain) {
      if (current && "value" in current && current.value === value) {
        return;
      }
    }
    if (current) {
      previous = current;
    }

    current = { value };

    onChange.emit();

    customSet?.(value);
  };

  const propInfo: StateProp = {
    type: "state",
    get() {
      return getValue(set, get(), () => {
        // no tracking needed
        if (propAccessor()?.type === "peek") {
          return;
        }

        return trackable()?.add(onChange);
      });
    },
    set(value: T) {
      return setValue(set, value);
    },
    stale(notify?: boolean) {
      if (!current) return;
      previous = current;
      current = undefined;
      dependencies.forEach((dependency) => {
        if (dependency.hasError()) {
          dependency.stale(notify);
        }
      });

      if (notify) {
        onChange.emit();
      }
    },
    refresh() {
      if (isComputing) return;
      recompute();
      onChange.emit();
    },
    on: onChange.on,
    hasError() {
      return !!current && "error" in current;
    },
    dispose() {
      onCleanup.emit();
      dependencies.clear();
    },
  };

  Object.assign(onChange, { $state: propInfo });

  if (save) {
    onChange.on(save);
  }

  return propInfo;
};

const createActionProp = <T, A extends any[]>(
  dispatch: (...args: A) => T,
  proxy: T
): ActionProp => {
  let prevResult: T | undefined;
  let current:
    | {
        count: number;
        args: A;
        result?: T;
        /**
         * dispatch error
         */
        error?: any;
      }
    | undefined;

  const onChange = emitter();
  const onDispatch = emitter<A>();

  const action = Object.assign(
    (...args: A) => {
      onDispatch.emit(args);
      current = { count: (current?.count ?? 0) + 1, args };
      try {
        current.result = dispatch.apply(proxy, args);
        if (isPromiseLike(current.result)) {
          current.result = async(current.result) as T;
        }
      } catch (ex) {
        current.error = ex;
      }

      prevResult = current.result;

      onChange.emit();
      if (current.error) {
        throw current.error;
      }
      return current.result;
    },
    {
      on: onDispatch.on,
      reload() {
        if (!current) return false;
        action(...current.args);
        return true;
      },
      load(...args: A) {
        if (current && current.args.every((x, i) => x === args[i])) {
          if (current.error) {
            throw current.error;
          }
          return current.result;
        }
        return action(...args);
      },
    }
  );

  const handleAsync = <A, S>(
    asyncResolver: (ar: AsyncResult) => A,
    syncResolver: (value: any, error: any) => S
  ): S | A => {
    const track = trackable()?.add;
    track?.(onChange);
    if (isPromiseLike(current?.result)) {
      const ar = async(current.result);
      if (ar.loading) {
        track?.(ar);
      }

      return asyncResolver(ar);
    }

    return syncResolver(current?.result, current?.error);
  };

  Object.defineProperties(action, {
    prevResult: {
      get() {
        return prevResult;
      },
    },
    called: {
      get() {
        trackable()?.add(onChange);
        return current?.count ?? 0;
      },
    },
    loading: {
      get() {
        return handleAsync(
          (ar) => ar.loading,
          () => false
        );
      },
    },
    awaited: {
      get() {
        return handleAsync(
          (ar) => ar.data,
          (data) => data
        );
      },
    },
    result: {
      get() {
        trackable()?.add(onChange);
        return current?.result;
      },
    },
    error: {
      get() {
        return handleAsync(
          (ar) => ar.error,
          (_, error) => error
        );
      },
    },
  });

  return {
    type: "action",
    get() {
      return action;
    },
    on: onChange.on,
    dispose() {
      onChange.clear();
    },
    setDispatcher(dispatcher: AnyFunc) {
      dispatch = dispatcher;
    },
  };
};

const createModelProxy = (
  descriptors: DescriptorMap,
  getProp: PropGetter,
  setProp?: (prop: string | symbol, value: any) => boolean
) => {
  const target = {};
  const toJSON = () => {
    const result: Dictionary = {};
    Object.keys(descriptors).forEach((key) => {
      const value = getProp(key).get();
      if (typeof value !== "function") {
        result[key] = value;
      }
    });
    return result;
  };
  const toString = () => {
    return `ModelProxy:${JSON.stringify(toJSON())}`;
  };

  return new Proxy(target, {
    get(_, prop) {
      if (prop === "toJSON") {
        return toJSON;
      }
      if (prop === "toString") {
        return toString;
      }
      return getProp(prop).get();
    },
    set(_, p, value) {
      if (!setProp) return false;
      return setProp(p, value);
    },
    deleteProperty() {
      return false;
    },
    ownKeys(_) {
      return Object.keys(descriptors);
    },
    getOwnPropertyDescriptor(_, p) {
      if (typeof p !== "string") {
        return undefined;
      }
      return descriptors[p];
    },
    /**
     * this trick to prevent immer tries to make a copy of nested models
     * ```js
     * const child = model({ name: 'Ging' })
     * const parent = model({ child })
     *
     * // perform mutation on child
     * parent.child.name = 'New name' // without this trick immer will create a copy of child
     * ```
     * @returns
     */
    getPrototypeOf() {
      return target;
    },
  });
};

const descriptorCache = new WeakMap<object, DescriptorMap>();
const baseClassCache = new WeakMap<object, AnyFunc[]>();
const getAllBaseClasses = (cls: any) => {
  let bases = baseClassCache.get(cls);
  if (!bases) {
    bases = [];

    let current = cls;

    // Traverse the prototype chain
    while (current) {
      let base = Object.getPrototypeOf(current);
      if (base && base !== Function.prototype && base.name) {
        bases.unshift(base);
      }
      current = base;
    }

    baseClassCache.set(cls, bases);
  }

  return bases;
};

const getOwnPropertyDescriptors = (obj: any): DescriptorMap => {
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

const createFactory =
  (strict: boolean) =>
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
      const s = createModel(strict, constructor, options);

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

    return createModel(strict, constructor, options);
  };

let modelUniqueId = 1;
const createModel = <T extends StateBase>(
  strict: boolean,
  constructor: (proxy: T) => readonly [T, DescriptorMap],
  options: ModelOptions<any> = {}
): Model<T> => {
  const { tags, rules, save, load } = options;
  // a proxy with full permissions (read/write/access private properties)
  let privateProxy: any;
  let proxy: any;
  let persistedValues: Dictionary;
  let descriptorsReady = false;
  const propInfoMap = new Map<string, Prop>();
  const onDispose = emitter();
  const descriptors: DescriptorMap = {};

  const getProp: PropGetter = (prop) => {
    if (!descriptorsReady) {
      throw new Error(
        "Access to model properties is not permitted during the model creation phase. It may be necessary to place this code within the `init()` function"
      );
    }
    if (prop === MODEL_TYPE) return apiProp;
    if (typeof prop !== "string") return undefinedProp;
    if (!(prop in descriptors)) return undefinedProp;

    let propInfo = propInfoMap.get(prop);

    if (!propInfo) {
      const { get, set, value } = descriptors[prop];
      // is action
      if (typeof value === "function") {
        if (value[NO_WRAP]) {
          propInfo = { type: "unknown", get: () => value };
        } else {
          propInfo = createActionProp(value, privateProxy);
        }
      } else {
        const isComputed = !!get;
        const getValue = get ?? (() => getPersistedValue(prop, value));

        propInfo = createStateProp(
          descriptors,
          getValue,
          isComputed,
          getProp,
          api.rules[prop],
          set?.bind(privateProxy),
          saveWrapper
        );
      }

      propInfoMap.set(prop, propInfo);
    }

    return propInfo;
  };

  const setProp: PropSetter = (prop, value) => {
    const propInfo = getProp(prop);
    if (propInfo && "type" in propInfo && propInfo.type === "state") {
      propInfo.set(value);
      return true;
    }
    return false;
  };

  privateProxy = createModelProxy(descriptors, getProp, setProp);

  const [{ dispose: factoryDispose }, [target, customDescriptors]] = disposable(
    () => constructor(privateProxy)
  );

  if (isModel<T>(target)) {
    const targetApi = getModelApi(target);

    if (targetApi) {
      return createModel(
        targetApi.strict,
        targetApi.constructor as any,
        targetApi.options
      );
    }

    return target;
  }

  Object.assign(descriptors, customDescriptors);

  onDispose.on(factoryDispose);

  const init = typeof target.init === "function" ? target.init : undefined;

  descriptorsReady = true;

  const saveWrapper = save ? () => save(privateProxy) : undefined;

  const stale = (...args: any[]) => {
    let notify = false;
    let props: string[] | undefined;
    // OVERLOAD: stale(prop, notify)
    if (typeof args[0] === "string") {
      props = [args[0]];
      notify = args[1];
    }
    // OVERLOAD: stale(props, notify)
    else if (Array.isArray(args[0])) {
      props = args[0];
      notify = args[1];
    }
    // OVERLOAD: stale(notify)
    else if (args.length === 1) {
      notify = args[0];
    }

    if (props) {
      (Array.isArray(props) ? props : [props]).forEach((prop) => {
        const propInfo = propInfoMap.get(prop);
        if (propInfo && "stale" in propInfo) {
          propInfo.stale(notify);
        }
      });
    } else {
      propInfoMap.forEach((propInfo) => {
        if ("stale" in propInfo) {
          propInfo.stale(notify);
        }
      });
    }
  };
  const getPersistedValue = (prop: string, defaultValue: any) => {
    if (!persistedValues) {
      persistedValues = load ? load() : {};
    }
    if (!(prop in persistedValues)) {
      return defaultValue;
    }
    return persistedValues[prop];
  };

  const refresh = (props?: string | string[]) => {
    if (props) {
      (Array.isArray(props) ? props : [props]).forEach((prop) => {
        const propInfo = propInfoMap.get(prop);
        if (propInfo && "refresh" in propInfo) {
          propInfo.refresh();
        }
      });
    } else {
      propInfoMap.forEach((propInfo) => {
        if ("refresh" in propInfo) {
          propInfo.refresh();
        }
      });
    }
  };
  const dispose = () => {
    onDispose.emit();

    propInfoMap.forEach((prop) => {
      if ("dispose" in prop) {
        prop.dispose();
      }
    });
  };

  const configure = (props: Dictionary, unstable: Dictionary | "all" = {}) => {
    Object.entries(props).forEach(([key, value]) => {
      let info = propInfoMap.get(key);
      if (!info) {
        if (unstable === "all") {
          const descriptor = descriptors[key];
          if (!descriptor) {
            return;
          }

          info = createStateProp(
            descriptors,
            () => descriptor.value,
            false,
            getProp,
            api.rules[key],
            undefined,
            saveWrapper
          );

          propInfoMap.set(key, info);
        } else {
          return;
        }
      }

      if (info.type === "action") {
        if (typeof value !== "function") {
          return;
        }
        info.setDispatcher(value);
        return;
      }

      if (info.type !== "state") {
        return;
      }

      // not unstable state
      if (unstable !== "all" && !unstable[key]) return;

      info.set(value);
    });
  };

  const undefinedProp: UnknownProp = { type: "unknown", get: NOOP };
  const api: ModelApi = Object.create({
    id: modelUniqueId++,
    refresh,
    stale,
    dispose,
    descriptors,
    constructor,
    rules: {},
    configure,
    strict,
    options,
  });
  const apiProp: UnknownProp = {
    type: "unknown",
    get: () => api,
  };

  if (rules) {
    Object.entries(rules).forEach(([key, rule]) => {
      if (!rule) return;

      let validate: (...args: Parameters<Validator>) => boolean | void;

      if (typeof rule === "function") {
        validate = rule;
      } else if ("parse" in rule) {
        validate = (value, transform) => {
          const newValue = rule.parse(value);
          if (value !== newValue) {
            transform?.(newValue);
          }
        };
      } else if ("validate" in rule) {
        validate = (value) => {
          rule.validate(value);
        };
      } else {
        // not support rule
        return;
      }

      api.rules[key] = (value, transform) => {
        const result = validate(value, transform);
        if (result === false) throw new Error(`Invalid '${key}' value`);
      };
    });
  }

  const getPublicProp = (prop: string | symbol) => {
    if (typeof prop === "string" && prop[0] === "_") {
      throw new Error("Cannot read private prop");
    }

    return getProp(prop);
  };

  const [{ dispose: initDispose }] = disposable(() => {
    tags?.forEach((tag) => {
      const tagDispose = tag.init(privateProxy);
      if (typeof tagDispose === "function") {
        onDispose.on(tagDispose);
      }
    });

    if (init) {
      const dispose = init.call(privateProxy);
      if (typeof dispose === "function") {
        onDispose.on(dispose);
      }
    }
  });

  proxy = strict
    ? // strict proxy has no setters
      createModelProxy(descriptors, getPublicProp)
    : createModelProxy(descriptors, getPublicProp, setProp);

  onDispose.on(initDispose);

  disposable()?.add(dispose);

  return proxy;
};

export type ModelTypeOptions<TState> = ModelOptions<TState> & {
  key?: keyof TState;
};

export const createModelType = <TState extends StateBase>(
  options?: ModelTypeOptions<TState>
) => {
  const { key: keyProp = "id" } = options ?? {};
  const extras: any[] = [];
  const defaultInits = new Set<VoidFunction>();
  const models = objectKeyedMap<any, Model<any>>();

  const modelType: ModelType<TState, {}> = Object.assign(
    (props: TState): any => {
      // make sure all getters invoked
      const values = { ...props };
      const key = values[keyProp];
      if (!key) {
        throw new Error(`The typed model must have ${keyProp as string} prop`);
      }
      const cached = models.get(key);

      if (cached) {
        getModelApi(cached)?.configure(values, "all");
        return cached;
      }

      const newModel = createModel(false, (proxy) => {
        const runtimeDescriptors = getOwnPropertyDescriptors(values);

        if (extras.length) {
          const mergedDescriptors = {
            ...runtimeDescriptors,
          };
          const runtimeInits = new Set<AnyFunc>();

          extras.forEach((extra) => {
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
      });

      models.set(key, newModel);

      return newModel;
    },
    {
      type: "modelType" as const,
      size: 0,
      with<TExtra extends StateBase>(
        input: TExtra | ((props: NoInfer<TState>) => TExtra)
      ): any {
        extras.push(input);
        return this;
      },
      init(fn: AnyFunc): any {
        defaultInits.add(fn);
        return this;
      },
      each(callback: AnyFunc): any {
        models.forEach(callback);
      },
      clear() {
        models.clear();
      },
      get(key: any): any {
        return models.get(key);
      },
      update(key: any, propsOrRecipe: unknown): any {
        const model = models.get(key);

        if (model) {
          if (typeof propsOrRecipe === "function") {
            alter(() => propsOrRecipe(model));
          } else {
            Object.assign(model, propsOrRecipe);
          }
        }

        return model;
      },
    }
  );

  Object.defineProperties(modelType, {
    size: { get: () => models.size },
  });

  return modelType;
};

export const dispose: DisposeFn = (input) => {
  const models = Array.isArray(input) ? input : [input];
  models.forEach((model) => {
    getModelApi(model)?.dispose();
  });
};

export const stale: StaleFn = (input, ...args: any[]) => {
  const models = Array.isArray(input) ? input : [input];
  models.forEach((model) => {
    getModelApi(model)?.stale(...args);
  });
};

export const refresh: RefreshFn = (input: any, ...args: any[]) => {
  const items = Array.isArray(input) ? input : [input];
  const track = trackable()?.add;
  items.forEach((item) => {
    // model
    if (isModel(item)) {
      getModelApi(item)?.refresh(...args);
    } else {
      // listenable
      const listenable = item as Listenable;
      track?.(listenable);
    }
  });
};

export const isModel = <T>(value: unknown): value is Model<T> => {
  return !!getModelApi(value);
};

export const model: ModelFn = Object.assign(createFactory(false), {
  strict: createFactory(true),
  type: createModelType,
});
