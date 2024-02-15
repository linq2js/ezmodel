import { disposable } from "./disposable";
import { objectKeyedMap } from "./objectKeyedMap";
import { AnyFunc, Group, NO_WRAP, NoInfer } from "./types";

export type GroupFn = {
  <TKey, TValue, TResult>(
    create: (key: TKey) => TValue,
    select: (value: NoInfer<TValue>) => TResult
  ): Group<TKey, TValue, TResult>;

  <TKey, TValue>(create: (key: TKey) => TValue): Group<TKey, TValue>;
};

export const group: GroupFn = <K, V, R = V>(
  create: (key: K) => V,
  select?: (value: V) => R
): Group<K, V, R> => {
  const items = objectKeyedMap({
    create(key: K) {
      const [{ dispose }, value] = disposable(() => create(key));
      return { value, dispose };
    },
    onRemove(value) {
      value.dispose();
    },
  });

  const g: Group<K, V, R> = Object.assign(
    (key: K) => {
      const value = items.get(key).value;
      if (select) {
        return select(value);
      }
      return value as unknown as R;
    },
    {
      [NO_WRAP]: true,
      size: 0,
      clear: items.clear,
      each(callback: AnyFunc) {
        items.forEach((v, k) => callback(v.value, k));
      },
      delete(keyOrFilter: any) {
        if (typeof keyOrFilter === "function") {
          return items.delete((value, key) => {
            return keyOrFilter(value.value, key);
          });
        }
        return items.delete(keyOrFilter);
      },
    }
  );

  Object.defineProperties(g, {
    size: { get: () => items.size },
  });

  return g;
};
