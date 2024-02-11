import { scope } from "./scope";

export type LocalData<T> = {
  type?: string;
  value: T;
  dispose?: VoidFunction;
};

export const local = scope(() => {
  let currentLoader: (() => LocalData<any>) | undefined;
  return {
    set(loader: () => LocalData<any>) {
      currentLoader = loader;
    },
    get<T = unknown>(
      type: string,
      create?: () => Pick<LocalData<T>, "dispose" | "value">
    ): LocalData<T> {
      if (!currentLoader) {
        throw new Error("No hook loader");
      }

      const localData = currentLoader();
      if (localData.type && localData.type !== type) {
        throw new Error(
          `Hook type not valid. Expect ${localData.type} but got ${type}`
        );
      }

      if (!localData.type) {
        localData.type = type;
        if (create) {
          Object.assign(localData, create());
        }
      }

      return localData;
    },
  };
});
