import { emitter } from "./emitter";
import { scope } from "./scope";
import { Listenable, Listener } from "./types";
import { NOOP } from "./utils";

export type Cancellable = Listenable<any> & {
  readonly cancelled: boolean;
  cancel: (reason?: any) => void;
  readonly reason: any;
  readonly signal: AbortSignal | undefined;
  readonly error: Error | undefined;
  throwIfCancelled: () => void;
};

const CANCELLED_ERROR_PROP = Symbol("ezmodel.cancelledError");

const create = (...listenables: Listenable<any>[]) => {
  let ac: AbortController | undefined;
  let cancelled: { reason: any } | undefined;
  let disposed = false;
  let error: Error | undefined;
  const onCancel = emitter<any>();
  const onDispose = emitter();

  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    onCancel.clear();
    onDispose.emit();
    onDispose.clear();
  };

  const cancel = (reason: any = "Cancelled without reason") => {
    if (cancelled) {
      return;
    }
    cancelled = { reason };
    ac?.abort(reason);
    onCancel.emit(reason);
    dispose();
  };

  const getError = () => {
    if (!error) {
      if (cancelled) {
        error = Object.assign(new Error(cancelled.reason), {
          [CANCELLED_ERROR_PROP]: true,
        });
      }
    }
    return error;
  };

  listenables.forEach((x) => {
    onDispose.on(x.on(cancel));
  });

  const instance: Cancellable = {
    get cancelled() {
      return Boolean(cancelled);
    },
    get error() {
      return getError();
    },
    get reason() {
      return cancelled?.reason;
    },
    get signal() {
      if (!ac && typeof AbortController !== "undefined") {
        ac = new AbortController();
        if (cancelled) {
          ac.abort(cancelled.reason);
        }
      }
      return ac?.signal;
    },
    cancel,
    on(listener: Listener<any>) {
      if (disposed) {
        return NOOP;
      }
      if (cancelled) {
        listener(cancelled.reason);
        return NOOP;
      }
      return onCancel.on(listener);
    },
    throwIfCancelled() {
      const e = getError();
      if (e) {
        ac?.signal.throwIfAborted?.();
        throw e;
      }
    },
  };

  return instance;
};

export const cancellable = Object.assign(scope(create), {
  any(...listenables: Listenable<any>[]) {
    return create(...listenables);
  },
  timeout(ms: number) {
    const ac = create();
    setTimeout(ac.cancel, ms, "Timeout");
    return ac;
  },
  isCancelledError(value: any): value is Error {
    return value?.[CANCELLED_ERROR_PROP];
  },
});
