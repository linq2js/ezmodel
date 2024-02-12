import { produce } from "immer";
import { async } from "./async";
import { emitter } from "./emitter";
import { trackable } from "./trackable";
import { AnyFunc, AsyncResult, Loader } from "./types";

export const loader = <T>(init: Promise<T> | (() => Promise<T>)): Loader<T> => {
  const onChange = emitter();
  let data: AsyncResult<T> | undefined;
  let loadFn: () => Promise<T>;

  if (typeof init === "function") {
    loadFn = init;
  } else {
    data = async(init);
    loadFn = () => init;
  }

  const load = () => {
    if (!data) {
      data = async(loadFn());
    }

    return data;
  };

  return Object.assign(
    (...args: any[]): any => {
      if (!args.length) {
        trackable()?.add(onChange);

        return load();
      }

      if (typeof args[0] === "function") {
        const reducer = args[0] as AnyFunc;

        if (!data) {
          data = async(loadFn());
        }

        if (data.loading) {
          data = async(
            data.then((resolved: T) => {
              return produce(resolved, reducer);
            }) as Promise<T>
          );
        } else {
          data = async(produce(data.data, reducer) as T);
        }
      } else {
        data = async(args[0]);
      }

      onChange.emit();
    },
    {
      stale() {
        data = undefined;
      },
      reload() {
        data = undefined;
        return load();
      },
    }
  );
};
