import { scope } from "./scope";

export const reversible = scope(() => {
  const actions = new Set<VoidFunction>();

  return {
    add(revert: VoidFunction) {
      actions.add(revert);
    },
    revert() {
      actions.forEach((action) => action());
    },
  };
});
