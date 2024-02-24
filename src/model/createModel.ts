import { cache } from "../cache";
import { createModelAction } from "./createModelAction";
import { createProxy } from "./createProxy";
import { createModelProperty } from "./createModelProperty";
import { disposable } from "../disposable";
import { emitter } from "../emitter";
import { getModelApi } from "../getModelApi";
import {
  DescriptorMap,
  MODEL_TYPE,
  ModelApi,
  ModelKind,
  NO_WRAP,
  Prop,
  PropGetter,
  PropSetter,
  StateBase,
  UndefinedProp,
  UnknownProp,
  Validator,
} from "../internal";
import { objectKeyedMap } from "../objectKeyedMap";
import { trackable } from "../trackable";
import {
  Dictionary,
  Listenable,
  Model,
  ModelOptions,
  ModelPart,
  NonFunctionProps,
} from "../types";
import { NOOP, equal } from "../utils";

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

let modelUniqueId = 1;
export const createModel = <T extends StateBase>(
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
          propInfo = createModelAction(value, privateProxy);
        }
      } else {
        const isComputed = !!get;
        const getValue = get ?? (() => getPersistedValue(prop, value));

        propInfo = createModelProperty(
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

      propInfo = createModelProperty(
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

          info = createModelProperty(
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
