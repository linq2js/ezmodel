import { trackable } from "../trackable";
import { local } from "../local";
import { disposable } from "../disposable";
import { NOOP, shallow } from "../utils";

export type Effect = (
  context: EffectContext
) => void | VoidFunction | Promise<void>;

export type EffectRunHOF = (runEffect: VoidFunction) => VoidFunction;

export type EffectContext = {
  /**
   * number of effect run
   */
  readonly count: number;
};

export type EffectFn = {
  (fn: Effect, hof?: EffectRunHOF): VoidFunction;
  (fn: Effect, deps: any[]): VoidFunction;
};

/**
 *
 * @param fn
 * @param hof High Order Function for effect run
 * @returns
 */
export const effect: EffectFn = (fn: Effect, extra?: any) => {
  const localEffect = local()?.get("effect");

  if (localEffect) {
    const deps = Array.isArray(extra) ? extra : [];
    // custom effect runner
    if (localEffect.run) {
      return localEffect.run(() => {
        return createEffect(fn);
      }, deps);
    }

    // run effect immediately
    // existing effect
    if (localEffect.dispose) {
      // deps changed
      if (shallow(localEffect.value, deps)) {
        return localEffect.dispose;
      }
    }
    localEffect.dispose?.();
    localEffect.value = deps;
    localEffect.dispose = createEffect(fn);

    return localEffect.dispose;
  }

  return createEffect(fn, typeof extra === "function" ? extra : undefined);
};

const createEffect = (fn: Effect, hof?: EffectRunHOF) => {
  let unwatch: VoidFunction | undefined;
  let onDispose: VoidFunction | undefined;
  let cleanupDisposable: VoidFunction | undefined;
  let modifiedRunEffect = NOOP;
  const context = { count: 0 };
  const runEffect = () => {
    unwatch?.();
    const [{ track }, result] = trackable(() => fn(context));
    onDispose = typeof result === "function" ? result : undefined;
    context.count++;
    unwatch = track(modifiedRunEffect);
  };

  modifiedRunEffect = hof ? hof(runEffect) : runEffect;

  const stopEffect = () => {
    unwatch?.();
    onDispose?.();
    cleanupDisposable?.();
  };

  disposable()?.add(stopEffect);

  runEffect();

  return stopEffect;
};

export const debounce = (ms: number) => (fn: VoidFunction) => {
  let timeoutId: any;
  return () => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(fn, ms);
  };
};
