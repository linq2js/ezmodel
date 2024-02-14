import { getModelApi } from "./model";
import { AnyFunc, NoInfer } from "./types";

export type Override<B, D> = {
  [key in keyof B | keyof D]: key extends keyof D
    ? D[key]
    : key extends keyof B
    ? B[key]
    : never;
};

export type Extend<T> = T extends readonly []
  ? {}
  : T extends readonly [infer F, ...infer R]
  ? Override<F, Extend<R>>
  : T extends any[]
  ? {}
  : T;

export type FromFn = {
  /**
   * create an object from map of get functions
   */
  <T extends Record<string, () => any>>(setterMap: T): {
    readonly [key in keyof T]: ReturnType<T[key]>;
  };

  /**
   * Create an object with properties specified in the `props` array. The `get` function will be called to compute the values of these properties.
   */
  <K extends string, V>(props: K[], get: (prop: NoInfer<K>) => V): {
    readonly [key in K]: V;
  };

  /**
   * Create an object that inherits properties from the input objects. This object creation process does not invoke property getters, unlike the spread operator.
   * ```js
   * const parentProps = {
   *    get computed() {
   *        return 1
   *    }
   * }
   *
   * const childProps = {}
   * const child1 = { ...parentProps, ...childProps } // this way will invoke all computed props
   * const child2 = from( parentProps, childProps ) // this way does not invoke any computed props
   * ```
   */
  <T extends any[]>(...models: T): Extend<T>;
};

export const from: FromFn = (...args: any[]) => {
  // OVERLOAD: from(props, getter)
  if (Array.isArray(args[0])) {
    const [props, get] = args;
    const result = {};
    props.forEach((prop: string) => {
      Object.defineProperty(result, prop, { get: () => get(prop) });
    });

    return result;
  }

  // OVERLOAD: from(...models)
  if (args.length > 1) {
    const models = args;
    const mergedDescriptors = {};
    models.forEach((model) => {
      Object.assign(
        mergedDescriptors,
        getModelApi(model)?.descriptors ??
          Object.getOwnPropertyDescriptors(model)
      );
    });

    return Object.defineProperties({} as any, mergedDescriptors);
  }

  const result = {};
  Object.entries(args[0] as Record<string, AnyFunc>).forEach(([key, get]) => {
    Object.defineProperty(result, key, { get });
  });
  return result;
};
