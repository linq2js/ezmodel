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

export type Extend<T> = T extends readonly []
  ? {}
  : T extends readonly [infer F, ...infer R]
  ? Override<F, Extend<R>>
  : T extends any[]
  ? {}
  : T;

export type ModelOptions<T> = {
  tags?: ModelTag<T>[];
  rules?: { [key in keyof T]?: (value: Awaited<T[key]>) => void | boolean };
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

type ModelApi = {
  dispose: AnyFunc;
  stale: AnyFunc;
  refresh: AnyFunc;
  descriptors: Record<string, PropertyDescriptor>;
};

const createStateProp = <T>(
  name: string,
  getState: () => T,
  computed: boolean,
  shape: any,
  getProp: PropGetter,
  validate?: AnyFunc
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

  const validateWrapper = validate
    ? (value: any) => {
        const result = validate(value);
        if (result === false) throw new Error(`Invalid ${name}`);
      }
    : undefined;

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

    if (isPromiseLike(value)) {
      const ar = async(value);
      if (validateWrapper) {
        if (ar.loading) {
          value = async(
            ar.then((resolved) => {
              validateWrapper(resolved);
              return resolved;
            })
          ) as T;
        } else if (ar.error) {
          // no need to validate
          value = ar as T;
        } else {
          // validate resolved value
          try {
            validateWrapper?.(ar.data);
            value = ar as T;
          } catch (ex) {
            value = async.reject(ex) as T;
          }
        }
      } else {
        value = ar as T;
      }
    } else {
      validateWrapper?.(value);
    }

    prev = { value };
    onChange.emit();
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

  return propInfo;
};

const createActionProp = <T, A extends any[]>(
  dispatch: (...args: A) => T,
  proxy: T
): ActionPropInfo => {
  let prev:
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
      prev = { count: (prev?.count ?? 0) + 1, args };
      try {
        prev.result = dispatch.apply(proxy, args);
        if (isPromiseLike(prev.result)) {
          prev.result = async(prev.result) as T;
        }
      } catch (ex) {
        prev.error = ex;
      }
      onChange.emit();
      if (prev.error) {
        throw prev.error;
      }
      return prev.result;
    },
    {
      on: onDispatch.on,
      reload() {
        if (!prev) return false;
        action(...prev.args);
        return true;
      },
      load(...args: A) {
        if (prev && prev.args.every((x, i) => x === args[i])) {
          if (prev.error) {
            throw prev.error;
          }
          return prev.result;
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
    if (isPromiseLike(prev?.result)) {
      const ar = async(prev.result);
      if (ar.loading) {
        track?.(ar);
      }

      return asyncResolver(ar);
    }

    return syncResolver(prev?.result, prev?.error);
  };

  Object.defineProperties(action, {
    called: {
      get() {
        trackable()?.add(onChange);
        return prev?.count ?? 0;
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
        return prev?.result;
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
  state: T,
  getProp: PropGetter,
  setProp?: (prop: string | symbol, value: any) => boolean
) => {
  return new Proxy(state, {
    get(_, prop) {
      return getProp(prop).get();
    },
    set(_, p, value) {
      if (!setProp) return false;
      return setProp(p, value);
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
      return state;
    },
  });
};

export type State<T> = T extends () => infer R ? R : T;

export type ModelFn = {
  strict<TInit>(
    init: TInit,
    options?: NoInfer<ModelOptions<State<TInit>>>
  ): Model<Readonly<State<TInit>>>;

  <TInit>(init: TInit, options?: NoInfer<ModelOptions<State<TInit>>>): Model<
    State<TInit>
  >;
};

export const model: ModelFn = Object.assign(
  (init: unknown, options?: ModelOptions<any>) => {
    const localModel = local()?.get("model", () => {
      const s = createModel(init, options);

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

    return createModel(init, options);
  },
  {
    strict(init: unknown, options?: ModelOptions<any>) {
      return model(init, Object.assign({}, options, { strict: true }));
    },
  }
);

export const from = <T extends any[]>(...models: T): Extend<T> => {
  const mergedDescriptors = {};
  models.forEach((model) => {
    Object.assign(
      mergedDescriptors,
      getModelApi(model)?.descriptors ?? Object.getOwnPropertyDescriptors(model)
    );
  });
  return Object.defineProperties({} as any, mergedDescriptors);
};

const createModel = <TInit>(
  init: TInit,
  { strict, tags, rules }: { strict?: boolean } & ModelOptions<any> = {}
): Model<State<TInit>> => {
  const creator = typeof init === "function" ? (init as AnyFunc) : () => init;

  let writableProxy: any;
  const propInfoMap = new Map<string, PropInfo>();
  const onDispose = emitter();
  const [{ dispose: factoryDispose }, shape] = disposable(creator);
  onDispose.on(factoryDispose);

  const customInit: AnyFunc =
    typeof shape.init === "function" ? shape.init : NOOP;

  const descriptors = Object.getOwnPropertyDescriptors(shape);

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
  const api = {
    refresh,
    stale,
    dispose,
    descriptors,
  };
  const apiProp: UnknownPropInfo = {
    type: "unknown",
    get: () => api,
  };

  const getProp: PropGetter = (prop) => {
    if (prop === MODEL_API_PROP) return apiProp;
    if (typeof prop !== "string") return undefinedProp;
    if (!(prop in shape)) return undefinedProp;

    let propInfo = propInfoMap.get(prop);

    if (!propInfo) {
      const descriptor = descriptors[prop];
      // computed
      if (descriptor.get) {
        propInfo = createStateProp(
          prop,
          descriptor.get,
          true,
          shape,
          getProp,
          rules?.[prop]
        );
      } else {
        const value = descriptor.value;
        // action
        if (typeof value === "function") {
          propInfo = createActionProp(value, writableProxy);
        } else {
          const getState = () => value;
          propInfo = createStateProp(
            prop,
            getState,
            false,
            shape,
            getProp,
            rules?.[prop]
          );
        }
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

  const getPublicProp = (prop: string | symbol) => {
    if (typeof prop === "string" && prop[0] === "_") {
      throw new Error("Cannot read private prop");
    }

    return getProp(prop);
  };

  writableProxy = createModelProxy(shape, getProp, setProp);

  const [{ dispose: initDispose }] = disposable(() => {
    tags?.forEach((tag) => {
      const tagDispose = tag.init(writableProxy);
      if (typeof tagDispose === "function") {
        onDispose.on(tagDispose);
      }
    });
    const customDispose = customInit.call(writableProxy);
    if (typeof customDispose === "function") {
      onDispose.on(customDispose);
    }
  });

  onDispose.on(initDispose);

  disposable()?.add(dispose);

  return strict
    ? createModelProxy(shape, getPublicProp)
    : createModelProxy(shape, getPublicProp, setProp);
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

export const refresh: RefreshFn = (input, ...args: any[]) => {
  const models = Array.isArray(input) ? input : [input];
  models.forEach((model) => {
    getModelApi(model)?.refresh(...args);
  });
};

export type OnFn = {
  (listenables: Listenable<any>[], listener: Listener<any>): VoidFunction;

  <T>(listenable: Listenable<T>, listener: Listener<T>): VoidFunction;

  (listenables: Listenable<any>[]): void;

  <T>(listenable: Listenable<T>): void;
};

export const on: OnFn = (
  listenables: Listenable | Listenable[],
  listener?: Listener
): any => {
  if (!listener) {
    const track = trackable()?.add;
    if (track) {
      (Array.isArray(listenables) ? listenables : [listenables]).forEach(
        (listenable) => {
          track(listenable);
        }
      );
    }

    return;
  }

  const cleanup = emitter();
  (Array.isArray(listenables) ? listenables : [listenables]).forEach(
    (listenable) => {
      cleanup.on(listenable.on(listener));
    }
  );
  return cleanup.emit;
};

const getModelApi = (value: any) => {
  return value?.[MODEL_API_PROP] as ModelApi | undefined;
};

export const isModel = (value: any) => {
  return !!getModelApi(value);
};
