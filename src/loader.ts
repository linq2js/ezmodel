import { produce } from "immer";
import { async } from "./async";
import { emitter } from "./emitter";
import { trackable } from "./trackable";
import { AnyFunc, AsyncResult, Loader } from "./types";

export const loader = <T>(load: () => Promise<T>): Loader<T> => {
  const onChange = emitter();
  let data: AsyncResult<T> | undefined;

  return {
    get data() {
      trackable()?.add(onChange);

      if (!data) {
        data = async(load());
      }

      return data;
    },
    set(valueOrReducer) {
      if (typeof valueOrReducer === "function") {
        const reducer = valueOrReducer as AnyFunc;

        if (!data) {
          data = async(load());
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
        data = async(valueOrReducer);
      }

      onChange.emit();
    },
    reload() {
      if (data) {
        data = undefined;
        onChange.emit();
      }
    },
  };
};
