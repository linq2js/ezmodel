import { effect } from "./effect";
import { model } from "./model";
import { tag } from "./tag";

describe("tag", () => {
  test("init", () => {
    const log = jest.fn();
    const logCount = tag((model: { count: number }) => {
      effect(() => {
        log(`count${model.count}`);
      });
    });
    const counter = model({ count: 1 }, { tags: [logCount] });
    counter.count++;
    expect(log.mock.calls).toEqual([
      ["count1"], // first time
      ["count2"], // count value changed
    ]);
  });

  test("count", () => {
    const myTag = tag();
    model({}, { tags: [myTag] });
    model({}, { tags: [myTag] });
    model({}, { tags: [myTag] });

    expect(myTag.count).toBe(3);
  });

  test("all", () => {
    const myTag = tag();
    model({}, { tags: [myTag] });
    model({}, { tags: [myTag] });
    model({}, { tags: [myTag] });

    expect(myTag.all.length).toBe(3);
  });
});
