import { getValue, setValue } from "./alter";
import { async } from "./async";
import { disposable } from "./disposable";
import { emitter } from "./emitter";
import { local } from "./local";
import { ModelTag } from "./tag";
import { trackable } from "./trackable";
import {
  Action,
  AnyFunc,
  AsyncResult,
  Listenable,
  Listener,
  NoInfer,
} from "./types";
import { NOOP, isPromiseLike } from "./utils";

export type Override<B, D> = {
  [key in keyof B | keyof D]: key extends keyof D
    ? D[key]
    : key extends keyof B
    ? B[key]
    : never;
};

export type Base<T> = T extends readonly [infer F, ...infer R]
  ? R extends readonly [] // end of array
    ? F
    : R extends readonly [infer L] // last item
    ? Override<F, L>
    : Override<F, Base<R>>
  : T extends Record<string, any>
  ? T
  : never;

export type Rule<T> =
  | ((value: T) => void | boolean)
  // sugar syntactic for zod
  | { parse(value: T): void }
  // sugar syntactic for other validation lib (ex: yup)
  | { validate(value: T): void };

export type ModelOptions<T> = {
  tags?: ModelTag<T>[];

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

export type StateBase = Record<string, any>;

export type PublicProps<T> = Omit<
  {
    // exclude private props
    [key in keyof T as key extends `_${string}` ? never : key]: T[key] extends (
      ...args: infer A
    ) => infer R
      ? Action<R, A>
      : T[key] extends Promise<infer R>
      ? AsyncResult<R>
      : T[key];
  },
  "init"
>;

export type NonFunctionProps<T> = {
  [key in keyof T as T[key] extends AnyFunc ? never : key]: T[key];
};

export const MODEL = Symbol("model");

export type Model<T> = T extends StateBase
  ? PublicProps<T> & {
      /**
       * This is trick for Typescript checking
       * Sometimes you need to pass model as mutable object, it is not safe if you do below
       * ```ts
       * // DON'T
       * const updateTodo = (todo: Todo, newTitle: string) => {
       *  // we cannot ensure the todo object is modal or plain object
       *  // so changing model prop does not trigger any reactive effect
       *  todo.title = newTitle
       * }
       * const todoObject = { title: 'abc' })
       * const todoModel = model({ title: 'abc' }))
       * updateTodo(todoObject; // No error
       * updateTodo(todoModel; // No error
       *
       * // DO
       * const updateTodo = (todo: Model<Todo>) => {
       *  todo.title = newTitle
       * }
       *
       * updateTodo(todoObject; // Typescript error: Property '[MODEL]'  is missing in type Todo
       * updateTodo(todoModel; // No error
       * ```
       */
      [MODEL]: true;
    }
  : never;

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
type ActionPropInfo = UpdatablePropInfo & { type: "action" };
type UnknownPropInfo = PropInfoBase & { type: "unknown" };

type PropInfo = StatePropInfo | ActionPropInfo | UnknownPropInfo;

type PropGetter = (prop: string | symbol) => PropInfo;
type PropSetter = (prop: string | symbol, value: any) => boolean;

const MODEL_API_PROP = Symbol("modelApi");

type Validator = (value: any, transform?: (value: any) => void) => void;

type ModelApi = {
  dispose: AnyFunc;
  stale: AnyFunc;
  refresh: AnyFunc;
  initFunctions: Set<AnyFunc>;
  descriptors: Record<string, PropertyDescriptor>;
  rules: Record<string, Validator | undefined>;
};

const createStateProp = <T>(
  descriptors: Record<string, PropertyDescriptor>,
  _name: string,
  getState: () => T,
  computed: boolean,
  shape: any,
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
          shape,
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
  };
};

const createModelProxy = <T extends StateBase>(
  target: T,
  descriptors: Record<string, PropertyDescriptor>,
  getProp: PropGetter,
  setProp?: (prop: string | symbol, value: any) => boolean
) => {
  return new Proxy(target, {
    get(_, prop) {
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

export type State<T> = T extends () => infer R ? R : T;

/**
 * model(base, initFn, options)
 * model(props, options)
 */

export type ModelFn = {
  strict: {
    <TInit>(
      init: TInit,
      options?: NoInfer<ModelOptions<State<TInit>>>
    ): ReadonlyModel<State<TInit>>;

    <const TBase, TInit>(
      base: TBase,
      initFn: (base: Base<TBase>) => TInit,
      options?: NoInfer<ModelOptions<State<Override<Base<TBase>, TInit>>>>
    ): ReadonlyModel<State<Override<Base<TBase>, TInit>>>;
  };

  <TInit>(init: TInit, options?: NoInfer<ModelOptions<State<TInit>>>): Model<
    State<TInit>
  >;

  <const TBase, TInit>(
    base: TBase,
    initFn: (base: NoInfer<Base<TBase>>) => TInit,
    options?: NoInfer<ModelOptions<State<Override<Base<TBase>, TInit>>>>
  ): Model<State<Override<Base<TBase>, TInit>>>;
};

export const mergeDescriptors = (
  initFunctions: Set<AnyFunc>,
  baseDescriptors: Record<string, PropertyDescriptor>,
  models: any[]
) => {
  models.forEach((model) => {
    const api = getModelApi(model);
    if (api) {
      api.initFunctions.forEach((init) => initFunctions.add(init));
      Object.assign(baseDescriptors, api.descriptors);
    } else {
      if (typeof model.init === "function") {
        initFunctions.add(model.init);
      }
      Object.assign(baseDescriptors, Object.getOwnPropertyDescriptors(model));
    }
  });
};

const createModelFactory =
  (strict: boolean) =>
  (...args: any[]) => {
    const baseDescriptors: Record<string, PropertyDescriptor> = {};
    const initFunctions = new Set<AnyFunc>();
    let init: any;
    let options: ModelOptions<any> | undefined;

    // OVERLOAD: modal(base, initFn, options?)
    if (typeof args[1] === "function") {
      let base;
      [base, init, options] = args;
      mergeDescriptors(
        initFunctions,
        baseDescriptors,
        Array.isArray(base) ? base : [base]
      );
    } else {
      [init, options] = args;
    }

    const localModel = local()?.get("model", () => {
      const s = createModel(
        strict,
        initFunctions,
        baseDescriptors,
        init,
        options
      );

      return {
        value: s,
        dispose() {
          dispose(s);
        },
      };
    });

    if (localModel) {
      return localModel.value as any;
    }

    return createModel(strict, initFunctions, baseDescriptors, init, options);
  };

export const model: ModelFn = Object.assign(createModelFactory(false), {
  strict: createModelFactory(true),
});

const createModel = <TInit>(
  strict: boolean,
  initFunctions: Set<AnyFunc>,
  baseDescriptors: Record<string, PropertyDescriptor> | undefined,
  init: TInit,
  { tags, rules, save, load }: ModelOptions<any> = {}
): Model<State<TInit>> => {
  // a proxy with full permissions (read/write/access private properties)
  let privateProxy: any;
  let proxy: any;
  const creator =
    typeof init === "function"
      ? () => {
          return init(privateProxy);
        }
      : () => init;
  let persistedValues: Record<string, any>;
  let descriptorsReady = false;
  const propInfoMap = new Map<string, PropInfo>();
  const descriptors: Record<string, PropertyDescriptor> = {};
  const onDispose = emitter();

  const getProp: PropGetter = (prop) => {
    if (!descriptorsReady) {
      throw new Error(
        "Access to model properties is not permitted during the model creation phase. It may be necessary to place this code within the `init()` function"
      );
    }
    if (prop === MODEL_API_PROP) return apiProp;
    if (typeof prop !== "string") return undefinedProp;
    if (!(prop in descriptors)) return undefinedProp;

    let propInfo = propInfoMap.get(prop);

    if (!propInfo) {
      const { get, set, value } = descriptors[prop];
      // is action
      if (typeof value === "function") {
        propInfo = createActionProp(value, privateProxy);
      } else {
        const isComputed = !!get;
        const getValue = get ?? (() => getPersistedValue(prop, value));

        propInfo = createStateProp(
          descriptors,
          prop,
          getValue,
          isComputed,
          target,
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

  privateProxy = createModelProxy({}, descriptors, getProp, setProp);
  const [{ dispose: factoryDispose }, target] = disposable(creator);
  onDispose.on(factoryDispose);

  if (typeof target.init === "function") {
    initFunctions.add(target.init);
  }

  Object.assign(
    descriptors,
    baseDescriptors,
    Object.getOwnPropertyDescriptors(target)
  );

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
  const undefinedProp: UnknownPropInfo = { type: "unknown", get: NOOP };
  const api: ModelApi = {
    refresh,
    stale,
    dispose,
    descriptors,
    initFunctions,
    rules: {},
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

    initFunctions.forEach((init) => {
      const dispose = init.call(privateProxy);
      if (typeof dispose === "function") {
        onDispose.on(dispose);
      }
    });
  });

  proxy = strict
    ? // strict proxy has no setters
      createModelProxy(target, descriptors, getPublicProp)
    : createModelProxy(target, descriptors, getPublicProp, setProp);

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

export type OnFn = {
  (listenables: Listenable<any>[], listener: Listener<any>): VoidFunction;

  <T>(listenable: Listenable<T>, listener: Listener<T>): VoidFunction;
};

export const on: OnFn = (
  listenables: Listenable | Listenable[],
  listener: Listener
): any => {
  const cleanup = emitter();
  (Array.isArray(listenables) ? listenables : [listenables]).forEach(
    (listenable) => {
      cleanup.on(listenable.on(listener));
    }
  );
  return cleanup.emit;
};

export const getModelApi = (value: any) => {
  return value?.[MODEL_API_PROP] as ModelApi | undefined;
};

export const isModel = (value: any) => {
  return !!getModelApi(value);
};
