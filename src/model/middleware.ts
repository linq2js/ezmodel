import { InternalAction } from "../internal";
import { Cancellable, cancellable } from "../cancellable";
import { isPromiseLike } from "../utils";
import { disposable } from "../disposable";
import { ActionMiddleware, AnyFunc, Equal } from "../types";

export const memo =
  (equal: Equal = Object.is): ActionMiddleware =>
  (action) => {
    let prev: { args: any[]; result: any } | undefined;

    return (...args) => {
      if (prev && prev.args.every((a, i) => equal(a, args[i]))) {
        return prev.result;
      }
      prev = { args, result: action(...args) };
      return prev.result;
    };
  };

export const once = (): ActionMiddleware => (action) => {
  let prev: { result: any } | undefined;
  return (...args) => {
    if (!prev) {
      prev = { result: action(...args) };
    }
    return prev.result;
  };
};

export const debounce =
  (ms: number): ActionMiddleware =>
  (action) => {
    let timeoutId: any;

    const cancel = () => {
      clearTimeout(timeoutId);
    };

    return (...args) => {
      cancel();
      disposable()?.add(cancel);
      const c = cancellable();
      timeoutId = setTimeout(() => {
        if (c?.cancelled) return;
        action(...args);
      }, ms);
    };
  };

export const throttle =
  (ms: number): ActionMiddleware =>
  (action) => {
    let last = 0;
    return (...args) => {
      const now = Date.now();
      if (last + ms <= now) {
        last = now;
        action(...args);
      }
    };
  };

export const apply = <T extends AnyFunc | AnyFunc[]>(
  actions: T,
  ...middleware: ActionMiddleware[]
) => {
  (Array.isArray(actions) ? actions : [actions]).forEach((action) => {
    const modelAction = action as InternalAction<AnyFunc>;
    if (
      modelAction.type !== "action" &&
      typeof modelAction.use !== "function"
    ) {
      throw new Error(`Expected model action but got ${action}`);
    }

    modelAction.use(...middleware);
  });
};

export const restartable = (): ActionMiddleware => (action) => {
  let cancellationToken: Cancellable | undefined;

  return (...args) => {
    cancellationToken?.cancel();
    [cancellationToken] = cancellable(() => action(...args));
  };
};

export const sequential = (): ActionMiddleware => (action) => {
  let lastResult: Promise<any> | undefined;

  return (...args) => {
    const invoke = () => {
      const result = action(...args);
      if (isPromiseLike(result)) {
        lastResult = result;
      } else {
        lastResult;
      }
    };
    if (lastResult) {
      lastResult = lastResult.finally(invoke);
    } else {
      invoke();
    }
  };
};
