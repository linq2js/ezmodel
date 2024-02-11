import { trackable } from "./trackable";
import { local } from "./local";
import { disposable } from "./disposable";
import { NOOP } from "./utils";

export type Effect = (context: EffectContext) => void | VoidFunction;

export type EffectRunHOF = (runEffect: VoidFunction) => VoidFunction;

export type EffectContext = {
  /**
   * number of effect run
   */
  readonly count: number;
};

/**
 *
 * @param fn
 * @param hof High Order Function for effect run
 * @returns
 */
export const effect = (fn: Effect, hof?: EffectRunHOF): VoidFunction => {
  const localEffect = local()?.get("effect");

  if (localEffect) {
    localEffect.dispose?.();
    localEffect.dispose = createEffect(fn, hof);
    return localEffect.dispose;
  }

  return createEffect(fn, hof);
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
