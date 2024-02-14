import { Suspense } from "react";
import { delay, wait } from "../async";
import { effect } from "../effect";
import { model } from "../model";
import { view } from "./view";
import { act, fireEvent, render } from "@testing-library/react";

const LOADING = <div>loading</div>;

describe("view", () => {
  test("suspense", async () => {
    const profile = model({
      get data() {
        return (async () => {
          await delay(5);
          return 1;
        })();
      },
    });
    const Comp = view(() => {
      const data = wait(profile.data);
      return <div>{data}</div>;
    });
    const { getByText } = render(
      <Suspense fallback={LOADING}>
        <Comp />
      </Suspense>
    );

    getByText("loading");
    await act(() => delay(10));
    getByText("1");
  });

  test("action status", async () => {
    const user = model({
      async doSomething() {
        await Promise.resolve();
        return 1;
      },
    });

    const Comp = view(() => {
      return (
        <>
          <button onClick={user.doSomething}>click</button>
          {user.doSomething.loading ? (
            LOADING
          ) : (
            <div>{user.doSomething.awaited ?? 0}</div>
          )}
        </>
      );
    });

    const { getByText } = render(<Comp />);

    getByText("0");
    fireEvent.click(getByText("click"));
    getByText("loading");
    await act(() => delay(10));
    getByText("1");
  });

  test("local model and effect", () => {
    const log = jest.fn();
    const Comp = view((props: { name: string }) => {
      const counter = model(() => ({
        count: 0,
        init() {
          return () => log("dispose model");
        },
        increment() {
          this.count++;
        },
      }));

      effect(() => {
        log(`count:${counter.count}`);

        return () => {
          log("dispose effect");
        };
      });

      props.name;

      return (
        <>
          <button onClick={counter.increment}>increment</button>
          <div>{counter.count}</div>
        </>
      );
    });

    const { getByText, rerender, unmount } = render(<Comp name="1" />);
    const $button = getByText("increment");

    getByText("0");
    fireEvent.click($button);
    getByText("1");
    fireEvent.click($button);
    getByText("2");

    rerender(<Comp name="2" />);
    // The local model remains across renderings
    getByText("2");
    fireEvent.click($button);
    getByText("3");

    unmount();

    expect(log.mock.calls).toEqual([
      ["count:0"],
      ["count:1"],
      ["count:2"],
      ["count:3"],
      ["dispose model"],
      ["dispose effect"],
    ]);
  });
});
