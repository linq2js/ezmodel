import { createDraft, finishDraft } from "immer";
import { isPromiseLike } from "./utils";

export type UpdateFn<T> = (value: T) => void;

type AlteringItem = { draft: { value: any } };

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
        const changes = finishDraft(item.draft);
        update(changes.value);
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
      item = { draft: createDraft({ value }) };
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
