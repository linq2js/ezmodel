import { getValue, setValue } from "./alter";
import { async } from "./async";
import { CacheItem } from "./cache";
import { cancellable } from "./cancellable";
import { createProxy } from "./createProxy";
import { emitter } from "./emitter";
import { DescriptorMap, PropGetter, StateProp, Validator } from "./internal";
import { propAccessor } from "./propAccessor";
import { scope } from "./scope";
import { trackable } from "./trackable";
import { isPromiseLike } from "./utils";

type EvaluateResult<T> = { value: T } | { error: any };

export const createStateProp = <T>(
  cached: CacheItem<EvaluateResult<T>>,
  descriptors: DescriptorMap,
  getState: () => T,
  computed: boolean,
  getProp: PropGetter,
  validate?: Validator,
  customSet?: (value: T) => void,
  save?: VoidFunction
): StateProp => {
  let thisProxy: any;
  let isComputing = false;
  let isTracking = false;
  let cancelPrevious: VoidFunction | undefined;
  const onCleanup = emitter();
  const onChange = emitter();
  const dependencies = new Set<StateProp>();
  const updater = {};

  const setCurrent = (current: EvaluateResult<T> | undefined) => {
    if (current === cached.current) return;
    if (
      current &&
      "value" in current &&
      cached.current &&
      "value" in cached.current &&
      current.value === cached.current.value
    ) {
      return;
    }
    if (
      current &&
      "error" in current &&
      cached.current &&
      "error" in cached.current &&
      current.error === cached.current.error
    ) {
      return;
    }
    cached.update(updater, current);
  };

  const onDependencyChange = () => {
    cached.previous = cached.current;
    setCurrent(undefined);
    onChange.emit();
  };

  onCleanup.on(cached.link(updater, onChange.emit));

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

      if (!thisProxy) {
        thisProxy = createProxy(
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
          let value = propAccessor.none(() => getState.call(thisProxy));
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
    if (cached.current) return cached.current;

    if (computed) {
      recompute();
      if (!cached.current) {
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

    const current = cached.current as EvaluateResult<T> | undefined;
    if (current && "value" in current) {
      if (isPromiseLike(current.value)) {
        current.value = async(current.value) as any;
      }
    }

    if (!cached.original) {
      cached.original = cached.current;
      cached.previous = cached.original;
    }

    return cached.current;
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
        return valueOrError(cached.current);
      }

      if (!cached.original) {
        cached.original = cached.current;
      }

      if (accessor.type === "original") {
        return valueOrError(cached.original);
      }

      if (accessor.type === "previous") {
        if (!cached.previous) {
          cached.previous = cached.original;
        }

        return valueOrError(cached.previous);
      }
    }

    return valueOrError(cached.current);
  };

  const set = (value: T) => {
    if (
      cached.current &&
      "value" in cached.current &&
      cached.current.value === value
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
        cached.current &&
        "value" in cached.current &&
        cached.current.value === value
      ) {
        return;
      }
    }

    // The custom set method should be invoked prior to updating the property value to ensure validation is performed.
    // Unlike with the computing process, we should not catch the validation error; this should be managed by the caller.
    customSet?.(value);

    if (cached.current) {
      cached.previous = cached.current;
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
      if (!cached.current) return;
      cached.previous = cached.current;
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
      if (cached.current && "value" in cached.current) {
        if (isPromiseLike(cached.current)) {
          const ar = async(cached.current);
          // should not do refreshing if the state is loading
          if (ar.loading) return;
        }
      }
      recompute();
      onChange.emit();
    },
    on: onChange.on,
    hasError() {
      return !!cached.current && "error" in cached.current;
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
