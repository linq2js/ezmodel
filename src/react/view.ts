import {
  ReactElement,
  useEffect,
  useRef,
  useRef as refHook,
  useLayoutEffect as layoutEffectHook,
} from "react";
import { trackable } from "../trackable";
import { stable } from "./stable";
import { useRerender } from "./useRerender";
import { scope } from "../scope";
import { LocalData, local } from "../local";
import { disposable } from "../disposable";

export type ViewOptions = { name?: string };

export const view = <P extends Record<string, any>>(
  render: (props: P) => ReactElement,
  { name: displayName }: ViewOptions = {}
) => {
  return Object.assign(
    stable<P>((props) => {
      const refresh = useRerender();
      const allLocalData = new Set<LocalData<any>>();
      const untrackRef = useRef<VoidFunction>();

      untrackRef.current?.();

      let error: any;
      //  should use track manually because render function might contain React hooks
      const [scopes, result] = scope(
        { trackable, local, disposable },
        (): any => {
          try {
            return render(props);
          } catch (ex) {
            error = ex;
          }
        },
        ({ local }) => {
          local.set(() => {
            const ref = refHook<LocalData<any>>();
            if (!ref.current) {
              let dispose: VoidFunction | undefined;
              ref.current = {
                value: undefined,
                run: (effect, deps) => {
                  layoutEffectHook(() => {
                    const result = effect();
                    if (typeof result === "function") {
                      dispose = result;
                    }
                    return dispose;
                  }, deps);
                  return () => dispose?.();
                },
              };
              allLocalData.add(ref.current);
            }
            return ref.current;
          });
        }
      );

      if (error) {
        scopes.disposable.dispose();
        throw error;
      }

      untrackRef.current = scopes.trackable.track(() => {
        refresh();
      });

      useEffect(() => {
        if (!untrackRef.current) {
          refresh();
        }

        return () => {
          allLocalData.forEach((localData) => {
            localData.dispose?.();
          });
          untrackRef.current?.();
          untrackRef.current = undefined;
        };
      }, []);

      return result;
    }),
    { displayName }
  );
};
