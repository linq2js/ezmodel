import { getValue, setValue } from "./alter";
import { async } from "./async";
import { disposable } from "./disposable";
import { emitter } from "./emitter";
import { local } from "./local";
import { trackable } from "./trackable";
import {
  AnyFunc,
  AsyncResult,
  Listenable,
  NoInfer,
  Rule,
  StateBase,
  Tag,
  NonFunctionProps,
  Model,
  MODEL_TYPE,
  NO_WRAP,
  Dictionary,
} from "./types";
import { NOOP, isClass, isPromiseLike } from "./utils";

export type ModelOptions<T> = {
  tags?: Tag<T>[];

  /**
   * LOCAL MODEL ONLY: the model will update specified props according to new input props
   * ```js
   * // WITHOUT UNSTABLE OPTION
   * const counter = model({ count: props.initCount })
   * console.log(counter.count)
   *
   * // initial rendering:
   * props.initCount = 1
   * counter.count = 1
   *
   * // changing counter.count to 2
   * props.initCount = 1
   * counter.count = 2
   *
   * // re-render with new props { initCount: 3 }
   * props.initCount = 3
   * counter.count = 2 // the count value is not the same as initCount
   *
   * // WITH UNSTABLE OPTION
   * const counter = model({ count: props.initCount }, { unstable: { count: true } })
   * console.log(counter.count)
   *
   * // initial rendering:
   * props.initCount = 1
   * counter.count = 1
   *
   * // changing counter.count to 2
   * props.initCount = 1
   * counter.count = 2
   *
   * // re-render with new props { initCount: 3 }
   * props.initCount = 3
   * counter.count = 3 // the count value is the same as initCount
   * ```
   */
  unstable?: {
    [key in keyof T as T[key] extends AnyFunc ? never : key]?: boolean;
  };

  rules?: { [key in keyof T]?: Rule<Awaited<T[key]>> };

  /**
   * This method will be invoked to load model persisted data until the first property access of the model occurs.
   * @returns
   */
  load?: () => {
    [key in keyof T as T[key] extends AnyFunc ? never : key]?: T[key];
  };

  /**
   * This method will be called to save model data to persistent storage whenever model properties have been changed.
   * @param model
   * @returns
   */
  save?: (model: T) => void;
};

type PropInfoBase = {
  get(): any;
};

type UpdatablePropInfo = PropInfoBase & {
  on: Listenable["on"];
  dispose: VoidFunction;
};

type StatePropInfo = UpdatablePropInfo & {
  type: "state";
  stale(notify?: boolean): void;
  refresh(): void;
  hasError(): boolean;
  set(value: any): void;
};

type ActionPropInfo = UpdatablePropInfo & {
  type: "action";
  setDispatcher(dispatcher: AnyFunc): void;
};
type UnknownPropInfo = PropInfoBase & { type: "unknown" };

type PropInfo = StatePropInfo | ActionPropInfo | UnknownPropInfo;

type PropGetter = (prop: string | symbol) => PropInfo;
type PropSetter = (prop: string | symbol, value: any) => boolean;

type Validator = (value: any, transform?: (value: any) => void) => void;

type ModelApi = {
  strict: boolean;
  dispose: AnyFunc;
  stale: AnyFunc;
  refresh: AnyFunc;
  constructor: () => StateBase;
  descriptors: DescriptorMap;
  rules: Dictionary<Validator | undefined>;
  configure(props: Dictionary, unstable?: Dictionary): void;
  options: ModelOptions<any>;
};

const createStateProp = <T>(
  descriptors: DescriptorMap,
  getState: () => T,
  computed: boolean,
  getProp: PropGetter,
  validate?: Validator,
  customSet?: (value: T) => void,
  save?: VoidFunction
): StatePropInfo => {
  let prev: { value: T } | { error: any } | undefined;
  let thisObject: any;
  let isComputing = false;
  let isTracking = false;
  const onCleanup = emitter();
  const onChange = emitter();
  const dependencies = new Set<StatePropInfo>();
  const onDependencyChange = () => {
    prev = undefined;
    onChange.emit();
  };

  const addDependency = (info: StatePropInfo) => {
    if (!dependencies.has(info)) {
      dependencies.add(info);
      onCleanup.on(info.on(onDependencyChange));
    }
  };
  const recompute = () => {
    if (isComputing) return;
    isComputing = true;
    try {
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
        const [{ onTrack }, result] = trackable(() => ({
          value: getState.call(thisObject),
        }));
        prev = result;
        onTrack((x) => {
          if ("$state" in x) {
            addDependency(x.$state as StatePropInfo);
          } else {
            // normal listenable
            onCleanup.on(x.on(onDependencyChange));
          }
        });
      } catch (error) {
        prev = { error };
      } finally {
        isTracking = false;
      }
    } finally {
      isComputing = false;
    }
  };

  const ensureValueReady = () => {
    if (prev) return;
    if (computed) {
      recompute();
    } else {
      try {
        prev = { value: getState() };
      } catch (error) {
        prev = { error };
      }
    }

    if (prev && "value" in prev && isPromiseLike(prev.value)) {
      prev.value = async(prev.value) as any;
    }
  };

  const get = () => {
    ensureValueReady();
    if (prev && "error" in prev) {
      throw prev.error;
    }
    return prev?.value as T;
  };

  const set = (value: T) => {
    if (prev && "value" in prev && prev.value === value) {
      return;
    }

    let transformed = false;
    const transform = (newValue: any) => {
      value = newValue;
      transformed = true;
    };

    if (isPromiseLike(value)) {
      const ar = async(value);
      if (validate) {
        if (ar.loading) {
          value = async(
            ar.then((resolved) => {
              validate(resolved, transform);
              return resolved;
            })
          ) as T;
        } else if (ar.error) {
          // no need to validate
          value = ar as T;
        } else {
          // validate resolved value
          try {
            validate(ar.data, transform);
            value = ar as T;
          } catch (ex) {
            value = async.reject(ex) as T;
          }
        }
      } else {
        value = ar as T;
      }
    } else if (validate) {
      validate(value, transform);
    }

    // verify data duplication again
    if (transformed) {
      if (prev && "value" in prev && prev.value === value) {
        return;
      }
    }

    prev = { value };

    onChange.emit();

    customSet?.(value);
  };

  const propInfo: StatePropInfo = {
    type: "state",
    get() {
      return getValue(set, get(), () => trackable()?.add(onChange));
    },
    set(value: T) {
      return setValue(set, value);
    },
    stale(notify?: boolean) {
      if (!prev) return;
      prev = undefined;
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
      return !!prev && "error" in prev;
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
): ActionPropInfo => {
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
  descriptors: Record<string, PropertyDescriptor>,
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

  return new Proxy(target, {
    get(_, prop) {
      if (prop === "toJSON") {
        return toJSON;
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

export const model: ModelFn = Object.assign(createFactory(false), {
  strict: createFactory(true),
});

type DescriptorMap = Record<string, PropertyDescriptor>;

const createModel = <T extends StateBase>(
  strict: boolean,
  constructor: () => readonly [T, DescriptorMap],
  options: ModelOptions<any> = {}
): Model<T> => {
  const { tags, rules, save, load } = options;
  // a proxy with full permissions (read/write/access private properties)
  let privateProxy: any;
  let proxy: any;
  let persistedValues: Record<string, any>;
  let descriptorsReady = false;
  const propInfoMap = new Map<string, PropInfo>();
  const onDispose = emitter();

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

  const [{ dispose: factoryDispose }, [target, descriptors]] =
    disposable(constructor);

  privateProxy = createModelProxy(descriptors, getProp, setProp);

  onDispose.on(factoryDispose);

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

  const init =
    typeof descriptors.init?.value === "function"
      ? descriptors.init.value
      : undefined;

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
  const configure = (props: Dictionary, unstable: Dictionary = {}) => {
    Object.entries(props).forEach(([key, value]) => {
      const info = propInfoMap.get(key);
      if (!info) return;
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
      if (!unstable[key]) return;
      info.set(value);
    });
  };

  const undefinedProp: UnknownPropInfo = { type: "unknown", get: NOOP };
  const api: ModelApi = {
    refresh,
    stale,
    dispose,
    descriptors,
    constructor,
    rules: {},
    configure,
    strict,
    options,
  };
  const apiProp: UnknownPropInfo = {
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

export const getModelApi = (value: any) => {
  return value?.[MODEL_TYPE] as ModelApi | undefined;
};

export const isModel = <T>(value: unknown): value is Model<T> => {
  return !!getModelApi(value);
};
