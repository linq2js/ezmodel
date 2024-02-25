import { disposable } from "./disposable";
import {
  Listenable,
  Equal,
  OnceOptions,
  AnyFunc,
  NoInfer,
  Listener,
} from "./types";
import { NOOP } from "./utils";

export type Emitter<T> = Listenable<T> & {
  size: () => number;
  emit: (args: T) => void;
  dispose: () => void;
  clear: () => void;
};

export type EmitterOptions<T> = {
  onDispose?: VoidFunction;
  equal?: Equal<T>;
  once?: boolean | OnceOptions;
};

export type EmitterFn = <T = void>(options?: EmitterOptions<T>) => Emitter<T>;

export const emitter: EmitterFn = ({
  onDispose,
  equal,
  once,
}: EmitterOptions<any> = {}) => {
  let emitted: { args: any } | undefined;
  let disposed = false;
  let emitting = false;
  let uniqueId = 0;
  const listeners = new Map<number, AnyFunc>();
  let isNew = new WeakSet<AnyFunc>();

  const clear = () => {
    listeners.clear();
    isNew = new WeakSet();
  };

  const e: Emitter<any> = {
    size() {
      return listeners.size;
    },
    emit(args) {
      if (emitted) {
        if (once || equal?.(emitted.args, args)) {
          return;
        }
      }
      emitted = { args };

      if (listeners.size) {
        try {
          emitting = true;
          listeners.forEach((listener) => {
            if (isNew.has(listener)) {
              isNew.delete(listener);
            } else {
              listener(args);
            }
          });
        } finally {
          emitting = false;
        }
      }
    },
    on(listener) {
      if (listener === NOOP) return NOOP;

      if (emitted) {
        if (once) {
          if (typeof once === "object" && once.recent) {
            listener(emitted.args);
          }

          return NOOP;
        }
      }

      const key = uniqueId++;
      listeners.set(key, listener);

      if (emitting) {
        isNew.add(listener);
      }

      let active = true;

      return () => {
        if (!active) {
          return;
        }
        active = false;
        listeners.delete(key);
        isNew.delete(listener);
      };
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      onDispose?.();
      clear();
    },
    clear,
  };

  return e;
};

export const filter = <T>(
  listenable: Listenable<T>,
  filterFn: (payload: NoInfer<T>) => boolean
): Listenable<T> => {
  return {
    on(listener) {
      return listenable.on((payload) => {
        if (filterFn(payload)) listener(payload);
      });
    },
  };
};

export type OnFn = {
  (listenables: Listenable<any>[], listener: Listener<any>): VoidFunction;

  <T>(listenable: Listenable<T>, listener: Listener<T>): VoidFunction;
};

export const on: OnFn = (
  listenables: Listenable | Listenable[],
  listener: Listener
): any => {
  const onCleanup = emitter();
  (Array.isArray(listenables) ? listenables : [listenables]).forEach(
    (listenable) => {
      onCleanup.on(listenable.on(listener));
    }
  );

  const cleanup = () => {
    onCleanup.emit();
    onCleanup.clear();
  };

  disposable()?.add(cleanup);

  return cleanup;
};
