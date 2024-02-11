import { createDraft, finishDraft } from "immer";
import { isPlainObject, isPromiseLike } from "./utils";

export type UpdateFn<T> = (value: T) => void;

export const IMMUTABLE_PROP = Symbol("immutable");

type AlteringItem = { base: { value: any }; draft: { value: any } };

let alteringItems: Map<UpdateFn<any>, AlteringItem> | undefined;

export const isAltering = () => !!alteringItems;

export const alter = <T>(fn: () => T): T => {
  if (alteringItems) {
    throw new Error("Nested alter() calls are not permitted");
  }
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
          update(
            containImmutableObject(item.base.value)
              ? applyChanges(item.base.value, changed.value)
              : changed.value
          );
        }
      });
    } finally {
      items.clear();
    }
  }
};

const containImmutableObject = (base: any): boolean => {
  if ((base && isPlainObject(base)) || Array.isArray(base)) {
    if (base?.[IMMUTABLE_PROP]) return true;

    return Object.keys(base).some((key) => containImmutableObject(base[key]));
  }

  return false;
};

const applyChanges = (base: any, changed: any) => {
  if ((base && isPlainObject(base)) || Array.isArray(base)) {
    if (changed && typeof changed === "object") {
      if (base[IMMUTABLE_PROP]) {
        Object.keys(changed).forEach((key) => {
          base[key] = applyChanges(base[key], changed[key]);
        });
        return base;
      } else {
        // only support array/object data types
        const copy: any = Array.isArray(changed) ? [] : {};
        Object.keys(changed).forEach((key) => {
          copy[key] = applyChanges(base[key], changed[key]);
        });
        return copy;
      }
    }
  }
  return changed;
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
