import { alter, getValue, setValue } from "./alter";
import { async } from "./async";
import { CacheItem, cache } from "./cache";
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
  ModelKind,
  UndefinedProp,
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
  ModelPart,
} from "./types";
import { NOOP, equal, isClass, isPromiseLike } from "./utils";

export type DisposeFn = {
  <T extends StateBase>(models: T[]): void;
  <T extends StateBase>(model: T): void;
};

export type StaleFn = {
  <T extends StateBase>(model: T, notify: boolean): void;
  <T extends StateBase>(
    model: T,
    prop: keyof NonFunctionProps<T>,
    notify?: boolean
  ): void;
  <T extends StateBase>(
    model: T,
    props: (keyof NonFunctionProps<T>)[],
    notify?: boolean
  ): void;
  <T extends StateBase>(models: T[], notify: boolean): void;
  <T extends StateBase>(models: T[]): void;
  <T extends StateBase>(model: T): void;
};

export type RefreshFn = {
  (when: Listenable | Listenable<any>[]): void;

  <T extends StateBase>(model: T, prop: keyof NonFunctionProps<T>): void;
  <T extends StateBase>(model: T, props?: (keyof NonFunctionProps<T>)[]): void;
  <T extends StateBase>(model: T): void;

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

  dynamic<TValue = any>(
    options?: ModelOptions<Record<string, TValue>>
  ): Model<Record<string, TValue>>;

  type: typeof createType;

  part: CreatePartFn;
};

type EvaluateResult<T> = { value: T } | { error: any };

const createStateProp = <T>(
  cacheItem: CacheItem<EvaluateResult<T>>,
  descriptors: DescriptorMap,
  getState: () => T,
  computed: boolean,
  getProp: PropGetter,
  validate?: Validator,
  customSet?: (value: T) => void,
  save?: VoidFunction
): StateProp => {
  let thisObject: any;
  let isComputing = false;
  let isTracking = false;
  let cancelPrevious: VoidFunction | undefined;
  const onCleanup = emitter();
  const onChange = emitter();
  const dependencies = new Set<StateProp>();
  const updater = {};
  const setCurrent = (value: EvaluateResult<T> | undefined) => {
    cacheItem.update(updater, value);
  };
  const onDependencyChange = () => {
    cacheItem.previous = cacheItem.current;
    setCurrent(undefined);
    onChange.emit();
  };
  onCleanup.on(cacheItem.link(updater, onChange.emit));
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
        thisObject = createProxy(
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
        setCurrent(result);
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
        setCurrent({ error });
      } finally {
        isTracking = false;
      }
    } finally {
      isComputing = false;
    }
  };

  const ensureValueReady = () => {
    if (cacheItem.current) return cacheItem.current;

    if (computed) {
      recompute();
      if (!cacheItem.current) {
        throw new Error("Something went wrong");
      }
    } else {
      try {
        let value = getState();
        setCurrent({ value });
      } catch (error) {
        setCurrent({ error });
      }
    }

    const current = cacheItem.current as EvaluateResult<T> | undefined;
    if (current && "value" in current) {
      if (isPromiseLike(current.value)) {
        current.value = async(current.value) as any;
      }
    }

    if (!cacheItem.original) {
      cacheItem.original = cacheItem.current;
      cacheItem.previous = cacheItem.original;
    }

    return cacheItem.current;
  };

  const valueOrError = (result: EvaluateResult<T> | undefined) => {
    if (!result) {
      throw new Error("Prop value is not ready");
    }

    if ("error" in result) {
      throw result.error;
    }
    return result.value;
  };

  const get = () => {
    const accessor = propAccessor();
    setCurrent(ensureValueReady());

    if (accessor) {
      if (isComputing && accessor.type !== "peek") {
        return valueOrError(cacheItem.current);
      }

      if (!cacheItem.original) {
        cacheItem.original = cacheItem.current;
      }

      if (accessor.type === "original") {
        return valueOrError(cacheItem.original);
      }

      if (accessor.type === "previous") {
        if (!cacheItem.previous) {
          cacheItem.previous = cacheItem.original;
        }

        return valueOrError(cacheItem.previous);
      }
    }

    return valueOrError(cacheItem.current);
  };

  const set = (value: T) => {
    if (
      cacheItem.current &&
      "value" in cacheItem.current &&
      cacheItem.current.value === value
    ) {
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
      }) as T;
    }

    // verify data duplication again
    if (shouldCheckIdentityAgain) {
      if (
        cacheItem.current &&
        "value" in cacheItem.current &&
        cacheItem.current.value === value
      ) {
        return;
      }
    }

    // The custom set method should be invoked prior to updating the property value to ensure validation is performed.
    // Unlike with the computing process, we should not catch the validation error; this should be managed by the caller.
    customSet?.(value);

    if (cacheItem.current) {
      cacheItem.previous = cacheItem.current;
    }

    setCurrent({ value });

    onChange.emit();
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
      if (!cacheItem.current) return;
      cacheItem.previous = cacheItem.current;
      setCurrent(undefined);
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
      // Refreshing is unnecessary if the property is being computed.
      if (isComputing) return;
      if (cacheItem.current && "value" in cacheItem.current) {
        if (isPromiseLike(cacheItem.current)) {
          const ar = async(cacheItem.current);
          // should not do refreshing if the state is loading
          if (ar.loading) return;
        }
      }
      recompute();
      onChange.emit();
    },
    on: onChange.on,
    hasError() {
      return !!cacheItem.current && "error" in cacheItem.current;
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

const createProxy = (
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

let modelUniqueId = 1;
const createModel = <T extends StateBase>(
  kind: ModelKind,
  constructor: (proxy: T) => readonly [T, DescriptorMap],
  options: ModelOptions<any> = {}
): Model<T> => {
  const { tags, rules, save, load, ref } = options;
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
          cache.get(ref?.key, ref?.[prop]),
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
    let propInfo = getProp(prop);
    // Add a new descriptor for dynamic model if it does not already exist.
    if (propInfo.type === "undefined" && kind === "dynamic") {
      const temp = { [prop]: undefined };
      descriptors[prop as string] = Object.getOwnPropertyDescriptor(
        temp,
        prop
      )!;

      propInfo = createStateProp(
        cache.get(ref?.key, ref?.[prop as string]),
        descriptors,
        NOOP,
        false,
        getProp,
        undefined,
        undefined,
        saveWrapper
      );

      propInfoMap.set(prop as string, propInfo);
    }

    if (propInfo && "type" in propInfo && propInfo.type === "state") {
      propInfo.set(value);
      return true;
    }

    return false;
  };

  privateProxy = createProxy(descriptors, getProp, setProp);

  const [{ dispose: factoryDispose }, [target, customDescriptors]] = disposable(
    () => constructor(privateProxy)
  );

  if (isModel<T>(target)) {
    const targetApi = getModelApi(target);

    if (targetApi) {
      return createModel(
        targetApi.kind,
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

  type Part = {
    get(): any;
    variant: any;
    def: ModelPart<any, any, any>;
    dispose: VoidFunction;
  };

  const parts = {
    all: new Set<Part>(),
    named: {} as Record<string, Part>,
    unnamed: objectKeyedMap<any, Part>(),
  };
  const getPart = (
    def: ModelPart<any, any, any>,
    name: string | undefined,
    variant: any
  ) => {
    const normalizedVariant = def.variant(variant);
    const create = () => {
      const [{ dispose }, result] = disposable(() =>
        def.part(proxy, normalizedVariant)
      );
      const get = typeof result === "function" ? result : () => result;
      const part = {
        dispose,
        def,
        get,
        variant: normalizedVariant,
      };

      parts.all.add(part);

      return part;
    };
    const isNamedPart = !!name;
    if (isNamedPart) {
      const prev = parts.named[name];
      if (prev) {
        if (equal(prev.variant, variant)) {
          return prev.get();
        }
        // should dispose prev part before creating new one
        prev.dispose();
        parts.all.delete(prev);
      }

      const part = create();

      parts.named[name] = part;

      return part.get();
    }

    const prev = parts.unnamed.get(normalizedVariant);
    if (prev) {
      return prev.get();
    }
    const part = create();

    parts.unnamed.set(normalizedVariant, part);

    return part.get();
  };

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
      persistedValues = load ? load(privateProxy) ?? {} : {};
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
    parts.all.forEach((x) => x.dispose());
    propInfoMap.forEach((prop) => {
      if ("dispose" in prop) {
        prop.dispose();
      }
    });
  };

  const configure = (props: Dictionary, unstable: Dictionary | "all" = {}) => {
    Object.entries(props).forEach(([prop, value]) => {
      let info = propInfoMap.get(prop);
      if (!info) {
        if (unstable === "all") {
          const descriptor = descriptors[prop];
          if (!descriptor) {
            return;
          }

          info = createStateProp(
            cache.get(ref?.key, ref?.[prop]),
            descriptors,
            () => descriptor.value,
            false,
            getProp,
            api.rules[prop],
            undefined,
            saveWrapper
          );

          propInfoMap.set(prop, info);
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
      if (unstable !== "all" && !unstable[prop]) return;

      info.set(value);
    });
  };

  const undefinedProp: UndefinedProp = { type: "undefined", get: NOOP };
  const api: ModelApi = {
    id: modelUniqueId++,
    refresh,
    stale,
    dispose,
    descriptors,
    constructor,
    rules: {},
    configure,
    kind,
    options,
    part: getPart,
  };
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

  proxy =
    kind === "strict"
      ? // strict proxy has no setters
        createProxy(descriptors, getPublicProp)
      : createProxy(descriptors, getPublicProp, setProp);

  onDispose.on(initDispose);

  disposable()?.add(dispose);

  return proxy;
};

export type ModelTypeOptions<TState> = ModelOptions<TState> & {
  key?: keyof TState;
};

export const createType = <TState extends StateBase>(
  options?: ModelTypeOptions<NoInfer<TState>>
) => {
  const { key: keyProp = "id" } = options ?? {};
  const extraPropsBuilders: any[] = [];
  const defaultInits = new Set<VoidFunction>();
  const models = objectKeyedMap<any, Model<any>>();

  const create = (props: TState): any => {
    const key = props[keyProp];
    // make sure all getters invoked
    const values = { ...props };

    if (!key) {
      throw new Error(`The typed model must have ${keyProp as string} prop`);
    }
    const cached = models.get(key);

    if (cached) {
      delete values[keyProp];
      getModelApi(cached)?.configure(values, "all");
      return cached;
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
      }
    );

    models.set(key, newModel);

    return newModel;
  };

  const modelType: ModelType<TState, {}, false> = Object.assign(create, {
    type: "modelType" as const,
    size: 0,
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
  });

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

export type CreatePartFn = {
  <TPart, TState, TVariant>(
    part: (state: TState, variant: TVariant) => TPart | (() => TPart),
    variant: (variant: NoInfer<TVariant>) => unknown
  ): ModelPart<TState, TPart, TVariant>;

  <TPart, TState, TVariant>(
    part: (state: TState, variant: TVariant) => TPart | (() => TPart)
  ): ModelPart<TState, TPart, TVariant>;

  <TPart, TState>(part: (state: TState) => TPart | (() => TPart)): ModelPart<
    TState,
    TPart,
    void
  >;
};

export const createPart: CreatePartFn = (part: any, variant?: any): any => {
  return {
    type: "modelPart",
    part,
    variant: variant ?? ((value: any) => value),
  };
};

export type PartFn = {
  <TState, TPart, TVariant>(
    state: TState,
    partDef: ModelPart<NoInfer<TState>, TPart, TVariant>,
    ...args: void extends TVariant ? [] : [variant: TVariant]
  ): TPart;

  <TState, TPart, TVariant>(
    state: TState,
    name: string,
    partDef: ModelPart<NoInfer<TState>, TPart, TVariant>,
    ...args: void extends TVariant ? [] : [variant: TVariant]
  ): TPart;
};

export const part: PartFn = (model: any, ...args: any[]): any => {
  let name: string | undefined;
  let def: ModelPart<any, any, any>;
  let variant: any;

  // get named part
  if (typeof args[0] === "string") {
    [name, def, variant] = args;
  } else {
    // get unnamed part
    [def, variant] = args;
  }

  return getModelApi(model)?.part(def, name, variant);
};

const createDynamic = createFactory("dynamic");

export const model: ModelFn = Object.assign(createFactory("normal"), {
  strict: createFactory("strict"),
  dynamic(options?: ModelOptions<any>) {
    return createDynamic({}, options);
  },
  type: createType,
  part: createPart,
});
