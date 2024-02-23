import { Suspense, useState } from "react";
import { delay, wait } from "../async";
import { effect } from "../effect";
import { model, refresh } from "../model";
import { view } from "./view";
import { act, fireEvent, render } from "@testing-library/react";
import { rx } from "./rx";

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
    const Comp = view((props: { name: string; id: number }) => {
      const [version, setVersion] = useState(0);
      const counter = model(
        {
          count: 0,
          id: props.id,
          init() {
            return () => log("dispose model");
          },
          increment() {
            this.count++;
          },
          // this is stable method, version is always up to date
          doSomething() {
            log("version:" + version);
          },
        },
        { unstable: { id: 1 } }
      );

      effect(() => {
        log(`count:${counter.count}`);

        return () => {
          log("dispose effect");
        };
      }, [version]);

      props.name;

      return (
        <>
          <button onClick={counter.increment}>increment</button>
          <button onClick={() => setVersion(version + 1)}>version</button>
          <button onClick={counter.doSomething}>something</button>
          <button>id:{counter.id}</button>
          <div>{counter.count}</div>
        </>
      );
    });

    const { getByText, rerender, unmount } = render(<Comp name="1" id={1} />);
    const $button = getByText("increment");

    getByText("0");
    fireEvent.click($button);
    getByText("1");
    fireEvent.click($button);
    getByText("2");

    getByText("id:1");

    rerender(<Comp name="2" id={2} />);

    getByText("id:2");
    // The local model remains across renderings
    getByText("2");
    fireEvent.click($button);
    getByText("3");

    // changing version will re-ren effect
    fireEvent.click(getByText("version")); // version = 1
    fireEvent.click(getByText("version")); // version = 2

    fireEvent.click($button);

    fireEvent.click(getByText("something")); // call doSomething
    // change version
    fireEvent.click(getByText("version")); // version = 3
    fireEvent.click(getByText("something")); // call doSomething

    unmount();

    expect(log.mock.calls).toEqual([
      ["count:0"],
      ["count:1"],
      ["count:2"],
      ["count:3"],
      ["dispose effect"],
      ["count:3"],
      ["dispose effect"],
      ["count:3"],
      ["count:4"],
      ["version:2"],
      ["dispose effect"],
      ["count:4"],
      ["version:3"],
      ["dispose effect"],
      ["dispose model"],
    ]);
  });

  test("rx with Suspense", async () => {
    const app = model({
      get data() {
        return Promise.resolve(1);
      },
      reload() {
        refresh(this, "data");
      },
    });
    const App = view(() => {
      return (
        <Suspense fallback={LOADING}>
          {rx(() => (
            <>{wait(app.data)}</>
          ))}
        </Suspense>
      );
    });

    const { getByText } = render(<App />);
    getByText("loading");
    await act(() => delay());
    act(() => {
      app.reload();
    });
    getByText("loading");
    await act(() => delay());
    getByText("1");
  });
});
