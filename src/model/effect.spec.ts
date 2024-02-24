import { model } from "..";
import { effect } from "../model/effect";

describe("effect", () => {
  test("dispose automatically", () => {
    const log = jest.fn();
    const counter = model({
      count: 0,
      increment() {
        this.count++;
      },
    });
    const dispose = effect(() => {
      log(`run${counter.count}`);

      return () => {
        log("dispose");
      };
    });

    counter.increment();

    dispose();

    counter.increment();

    expect(log.mock.calls).toEqual([["run0"], ["run1"], ["dispose"]]);
  });
});
