import { isDraft, original } from "immer";
import { AnyFunc, NoInfer } from "./types";
import { getOwnPropertyDescriptors } from "./getOwnPropertyDescriptors";
import { createObjectFromDescriptors } from "./createObject";
import { DescriptorMap } from "./internal";

export const NOOP = () => {
  //
};

export const NOT_EQUAL = () => false;

export const STRICT_EQUAL = Object.is;

export type CurriedFunction<T extends any[], R> = T extends [
  infer A,
  ...infer B
]
  ? (a: A) => CurriedFunction<B, R>
  : R;

export function curry<T extends any[], R>(
  func: (...args: T) => R
): CurriedFunction<T, R> {
  return function curried(...args: any[]): any {
    if (args.length >= func.length) {
      return func(...(args as T));
    } else {
      return function (...args2: any) {
        return curried(...args.concat(args2));
      };
    }
  } as CurriedFunction<T, R>;
}

export const isObject = (value: any) => {
  return typeof value === "object" && value;
};

export const enqueue = Promise.resolve().then.bind(Promise.resolve());

/**
 * perform shallowing comparison for 2 values
 * @param a
 * @param b
 * @returns
 */
export const shallow = (a: any, b: any) => {
  if (a === b) {
    return true;
  }
  if (!isObject(a) || !isObject(b)) {
    return false;
  }

  const keys = Array.from(new Set(Object.keys(a).concat(Object.keys(b))));

  return keys.every((key) => a[key] === b[key]);
};

export { equal } from "@wry/equality";

/**
 * Unary function
 */
export type UF<T, R> = (arg: T) => R;

export type Pipe = {
  <T, R1>(initial: T, f1: UF<T, R1>): R1;

  <T, R1, R2>(initial: T, f1: UF<T, R1>, f2: UF<R1, R2>): R2;

  <T, R1, R2, R3>(
    initial: T,
    f1: UF<T, R1>,
    f2: UF<R1, R2>,
    f3: UF<R2, R3>
  ): R3;

  <T, R1, R2, R3, R4>(
    initial: T,
    f1: UF<T, R1>,
    f2: UF<R1, R2>,
    f3: UF<R2, R3>,
    f4: UF<R3, R4>
  ): R4;

  <T, R1, R2, R3, R4, R5>(
    initial: T,
    f1: UF<T, R1>,
    f2: UF<R1, R2>,
    f3: UF<R2, R3>,
    f4: UF<R3, R4>,
    f5: UF<R4, R5>
  ): R5;

  <T, R1, R2, R3, R4, R5, R6>(
    initial: T,
    f1: UF<T, R1>,
    f2: UF<R1, R2>,
    f3: UF<R2, R3>,
    f4: UF<R3, R4>,
    f5: UF<R4, R5>,
    f6: UF<R5, R6>
  ): R6;
};

export const pipe: Pipe = (initial: any, ...functions: AnyFunc[]) =>
  functions.reduce((result, func) => func(result), initial);

export const isPromiseLike = <T>(value: any): value is Promise<T> => {
  return value && typeof value.then === "function";
};

export const isPlainObject = (value: any) => {
  if (typeof value !== "object" || value === null) {
    return false; // Not an object or is null
  }

  let proto = Object.getPrototypeOf(value);
  if (proto === null) {
    return true; // `Object.create(null)` case
  }

  let baseProto = proto;
  while (Object.getPrototypeOf(baseProto) !== null) {
    baseProto = Object.getPrototypeOf(baseProto);
  }

  return proto === baseProto;
};

export const isClass = (func: unknown) => {
  return (
    typeof func === "function" &&
    /^class\s/.test(Function.prototype.toString.call(func))
  );
};

export const raw = <T>(value: T): T => {
  return isDraft(value) ? (original(value) as T) : value;
};

export const remap = <
  TSource extends {},
  TMap extends Record<
    string,
    keyof TSource | 1 | true | ((source: NoInfer<TSource>) => any)
  >,
  TExtra extends {} = {}
>(
  source: TSource,
  map: TMap,
  extra?: TExtra
): TExtra & {
  [key in keyof TMap]: TMap[key] extends true | 1
    ? key extends keyof TSource
      ? TSource[key]
      : never
    : TMap[key] extends (source: NoInfer<TSource>) => infer R
    ? R
    : TMap[key] extends keyof TSource
    ? TSource[TMap[key]]
    : never;
} => {
  const descriptors: DescriptorMap = extra
    ? getOwnPropertyDescriptors(extra)
    : {};

  Object.entries(map).forEach(([destProp, sourceProp]) => {
    if (typeof sourceProp === "function") {
      descriptors[destProp] = { get: () => sourceProp(source) };
    } else if (typeof sourceProp !== "string") {
      descriptors[destProp] = { get: () => source[destProp as keyof TSource] };
    } else {
      descriptors[destProp] = { get: () => source[sourceProp] };
    }
  });

  return createObjectFromDescriptors(descriptors) as any;
};
