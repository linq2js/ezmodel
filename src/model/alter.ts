import { createDraft, current, finishDraft, produce } from "immer";

import { isPromiseLike } from "../utils";
import { AnyFunc, Dictionary, NoInfer, UpdateRecipe } from "../types";
import { async } from "../async";
import { propAccessor } from "../propAccessor";

export type AlterFn = {
  <T>(fn: () => T): T;

  <T>(model: T, props: NoInfer<UpdateRecipe<T>>): T;
};

export type UpdateFn<T> = (value: T) => void;

type AlteringItem = { base: { value: any }; draft: { value: any } };

let alteringItems: Map<UpdateFn<any>, AlteringItem> | undefined;

export const isAltering = () => !!alteringItems;

const checkNestedAlterCall = () => {
  if (alteringItems) {
    throw new Error("Nested alter() calls are not permitted");
  }
};

export const alter: AlterFn = (...args: any[]) => {
  checkNestedAlterCall();

  if (args.length == 2) {
    const [model, props] = args;
    Object.entries(props as Dictionary).forEach(([prop, value]) => {
      if (typeof value === "function") {
        const reducer = value;
        const prevValue = model[prop];

        if (isPromiseLike(prevValue)) {
          const ar = async(prevValue);

          if (ar.loading) {
            model[prop] = async(
              prevValue.then((resolved) => {
                return produce(resolved, reducer);
              })
            );
          } else if (!ar.error) {
            try {
              model[prop] = async(produce(ar.data, reducer));
            } catch (ex) {
              model[prop] = async.reject(ex);
            }
          }
        } else {
          try {
            model[prop] = produce(prevValue, reducer);
          } catch (ex) {
            throw ex;
          }
        }
      } else {
        model[prop] = value;
      }
    });

    return model;
  }

  const fn: AnyFunc = args[0];
  const items = new Map<UpdateFn<any>, AlteringItem>();
  try {
    alteringItems = items;
    const result = fn();
    if (isPromiseLike(result)) {
      throw new Error("alter() does not support async updating");
    }
    return result;
  } finally {
    alteringItems = undefined;
    try {
      items.forEach((item, update) => {
        const changed = finishDraft(item.draft);
        if (changed.value !== item.base.value) {
          update(changed.value);
        }
      });
    } finally {
      items.clear();
    }
  }
};

export const getValue = <T>(
  update: UpdateFn<T>,
  value: T,
  onFallback?: VoidFunction
) => {
  if (alteringItems) {
    let item = alteringItems.get(update);
    if (!item) {
      const base = { value };
      item = { base, draft: createDraft(base) };
      alteringItems.set(update, item);
    }

    const accessorType = propAccessor()?.type;
    if (accessorType === "original") {
      return item.base.value;
    }

    if (accessorType === "peek") {
      return current(item.draft).value;
    }

    return item.draft.value;
  }

  onFallback?.();

  return value;
};

export const setValue = <T>(
  update: UpdateFn<T>,
  value: T,
  onFallback?: VoidFunction
) => {
  if (alteringItems) {
    const item = alteringItems.get(update);
    if (item) {
      item.draft.value = value;
      return;
    }
  }

  onFallback?.();

  update(value);
};
