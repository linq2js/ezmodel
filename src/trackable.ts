import { scope } from "./scope";
import { Listenable } from "./types";

type Tracker = {
  track: (listenable: Listenable<void>) => void;
};

/**
 * trackable scope
 */
export const trackable = scope(() => {
  const allListenableList = new Set<Listenable>();
  const activeWatchers = new Set<Tracker>();

  return {
    listenables: allListenableList,
    add(...listenables: Listenable<void>[]) {
      const { size } = allListenableList;
      listenables.forEach((listenable) => {
        allListenableList.add(listenable);
      });
      const hasChange = size !== allListenableList.size;
      if (hasChange) {
        activeWatchers.forEach((x) => {
          listenables.forEach((listenable) => x.track(listenable));
        });
      }
    },
    onTrack(listener: (listenable: Listenable) => void) {
      const watcher: Tracker = { track: listener };

      allListenableList.forEach(watcher.track);
      activeWatchers.add(watcher);

      return () => {
        activeWatchers.delete(watcher);
      };
    },
    track(onChange: VoidFunction) {
      const unsubscribes: VoidFunction[] = [];
      const disposables: VoidFunction[] = [];
      const watcher: Tracker = {
        track(listenable) {
          unsubscribes.push(listenable.on(onChange));
        },
      };

      allListenableList.forEach(watcher.track);
      activeWatchers.add(watcher);

      return () => {
        activeWatchers.delete(watcher);
        unsubscribes.forEach((x) => x());
        disposables.forEach((x) => x());
      };
    },
  };
});
