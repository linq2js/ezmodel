import { scope } from "./scope";

export const disposable = scope(() => {
  const disposes = new Set<VoidFunction>();
  let disposed = false;

  return {
    get count() {
      return disposes.size;
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      disposes.forEach((x) => x());
      disposes.clear();
    },
    add(dispose: VoidFunction) {
      disposes.add(dispose);
      return () => disposes.delete(dispose);
    },
  };
});
