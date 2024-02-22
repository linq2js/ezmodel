import { emitter } from "./emitter";
import { NOOP } from "./utils";

export type CacheItem<T> = {
  readonly current: T | undefined;
  previous: T | undefined;
  original: T | undefined;
  link(source: any, listener: VoidFunction): VoidFunction;
  update(source: any, value: T | undefined): void;
  dispose(): void;
};

const createItem = <T>(
  noDispatch: boolean,
  onNoLink?: VoidFunction
): CacheItem<T> => {
  let current: any;
  const onChange = emitter<any>();

  return {
    get current() {
      return current;
    },
    update(source, value) {
      const changed = value !== current;
      current = value;
      if (changed && !noDispatch) {
        onChange.emit(source);
      }
    },
    original: undefined,
    previous: undefined,
    link(source, changeListener) {
      if (noDispatch) return NOOP;
      const unsubscribe = onChange.on((target) => {
        if (target === source) return;
        changeListener();
      });
      return () => {
        unsubscribe();
        if (!onChange.size()) {
          onNoLink?.();
        }
      };
    },
    dispose() {
      onChange.clear();
    },
  };
};

export const createCache = () => {
  const objectCaches = new Map<any, Map<any, CacheItem<any>>>();

  return {
    get<T>(key?: any, path?: any): CacheItem<T> {
      if (typeof key === "undefined" || key === null || !path) {
        return createItem(true);
      }
      let objectCache = objectCaches.get(key);
      if (!objectCache) {
        objectCache = new Map();
        objectCaches.set(key, objectCache);
      }
      const localObjectCache = objectCache;
      let item = localObjectCache.get(path);
      if (!item) {
        item = createItem(false, () => {
          // do cleanup if no link
          if (localObjectCache.get(path) === item) {
            localObjectCache.delete(path);
            if (!localObjectCache.size) {
              if (objectCaches.get(key) === localObjectCache) {
                objectCaches.delete(key);
              }
            }
          }
        });
        objectCache.set(path, item);
      }

      return item;
    },
    clear(keys?: any[]) {
      if (keys) {
        keys.forEach((key) => {
          const objectCache = objectCaches.get(key);
          if (objectCache) {
            objectCache.forEach((item) => item.dispose());
            objectCache.clear();
          }
        });
      } else {
        objectCaches.forEach((objectCache) => {
          objectCache.forEach((item) => item.dispose());
          objectCache.clear();
        });
        objectCaches.clear();
      }
    },
  };
};

export const cache = createCache();
