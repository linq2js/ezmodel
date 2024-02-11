/* eslint-disable max-nested-callbacks */
import { all, async, loadable, race, wait } from "./async";

describe("async", () => {
  test("no need to wait if all promises are resolved", () => {
    const v1 = async(1);
    const v2 = async(2);
    const v3 = race({ v1, v2 });
    const v4 = all({ v3 });
    const v5 = all({ v4 }, (x) => x.v4);
    expect(v5.data).toEqual({ v3: { v1: 1 } });
  });
});

describe("loadable", () => {
  test("loadable: array", () => {
    const [l1, l2, l3] = loadable([
      undefined,
      async(1),
      async.reject("error"),
    ] as const);

    expect(l1).toEqual({ data: undefined });
    expect(l2).toEqual({ data: 1 });
    expect(l3).toEqual({ error: "error" });
  });

  test("loadable: object", () => {
    const r = loadable({
      l1: undefined,
      l2: async(1),
      l3: async.reject("error"),
    });

    expect(r.l1).toEqual({ data: undefined });
    expect(r.l2).toEqual({ data: 1 });
    expect(r.l3).toEqual({ error: "error" });
  });

  test("catch: normal value", () => {
    const a = all(
      { p2: async.reject("invalid"), p1: async(1) },
      null,
      (error) => `${error}-error`
    );
    expect(a.data).toEqual("invalid-error");
  });

  test("catch: resolved async value #1", () => {
    const a = all(
      {
        p2: async.reject("invalid"),
        p1: async(1),
      },
      (x) => x,
      (error) => async(`${error}-error`)
    );
    expect(a.data).toEqual("invalid-error");
  });

  test("catch: resolved async value #2", () => {
    const a = all(
      {
        // eslint-disable-next-line prefer-promise-reject-errors
        p2: Promise.reject("invalid"),
        p1: Promise.resolve(1),
      },
      (x) => x,
      // eslint-disable-next-line promise/no-promise-in-callback
      (error) => Promise.resolve(`${error}-error`)
    );
    expect(a).resolves.toEqual("invalid-error");
  });

  test("nocatch: rejected async value #1", () => {
    const a = all({
      // eslint-disable-next-line prefer-promise-reject-errors
      p2: Promise.reject("invalid"),
      p1: Promise.resolve(1),
    });
    expect(a).rejects.toEqual("invalid");
  });
});

describe("wait", () => {
  test("wait: fulfilled", () => {
    const r = wait([async(1), async(true)]);
    expect(r).toEqual([1, true]);
  });

  test("wait: loading", () => {
    expect(() => wait(Promise.resolve(1))).toThrow();
  });

  test("wait: error", () => {
    expect(() => wait(async.reject("error"))).toThrow("error");
  });
});
