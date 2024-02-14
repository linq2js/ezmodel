import { filter } from "./emitter";
import { dispose, refresh, stale, model, from, on } from "./model";

describe("basic usages", () => {
  test("getting value", () => {
    const counter = model({ count: 1 });

    expect(counter.count).toBe(1);
  });

  test("validate", () => {
    const counter = model(
      { count: 1 },
      { rules: { count: (value) => value > 0 } }
    );
    expect(() => (counter.count = 0)).toThrow("Invalid count");
  });

  test("mutate property", () => {
    const counter = model({ count: 1 });
    counter.count++;
    expect(counter.count).toBe(2);
  });

  test("mutate property outside action", () => {
    const counter = model.strict({ count: 1 });

    expect(() => {
      (counter as any).count = 2;
    }).toThrow();
  });

  test("calling action", () => {
    const counter = model({
      count: 1,
      increment() {
        this.count++;
        return true;
      },
    });

    expect(counter.count).toBe(1);
    expect(counter.increment.called).toBe(0);
    expect(counter.increment.result).toBeUndefined();
    counter.increment();
    expect(counter.increment.called).toBe(1);
    expect(counter.increment.result).toBe(true);
    expect(counter.count).toBe(2);
  });

  test("multiple inheritance", () => {
    const log = jest.fn();
    // animal is plain object
    const animal = {
      name: "",
      get class() {
        log("animal");
        return "animal";
      },
    };
    const wingedAnimal = model(
      from(animal, {
        // override name prop of animal
        name: false,
        get class() {
          log("wingedAnimal");
          return "wingedAnimal";
        },
        get wings() {
          return true;
        },
      })
    );
    const bat = model(
      from(animal, wingedAnimal, {
        // override name prop of both animal and wingedAnimal
        get name() {
          return "bat";
        },
      })
    );

    expect(bat.name).toBe("bat");
    expect(bat.class).toBe("wingedAnimal");
    // should not call class property of animal
    expect(log.mock.calls).toEqual([["wingedAnimal"]]);
  });

  test("computed prop", () => {
    const counter = model({
      count: 1,
      get doubledCount() {
        return this.count * 2;
      },
      increment() {
        this.count++;
        return true;
      },
    });

    expect(counter.doubledCount).toBe(2);
    counter.increment();
    expect(counter.doubledCount).toBe(4);
  });

  test("copy props", () => {
    const counter = model({
      count: 1,
      increment() {
        this.count++;
        return true;
      },
    });
    const c1 = { ...counter };
    counter.increment();
    const c2 = { ...counter };
    expect(c1.count).toBe(1);
    expect(c2.count).toBe(2);
  });

  test("all props should be readonly in strict mode", () => {
    const counter = model.strict({ count: 1 });
    expect(() => {
      (counter as any).count = 2;
    }).toThrow();
    expect(counter.count).toBe(1);
  });

  test("private prop", () => {
    const counter = model({
      _count: 1,
      get count() {
        return this._count;
      },
    });
    expect(counter.count).toBe(1);
    expect(() => (counter as any)._count).toThrow();
  });
});

describe("async", () => {
  test("working with promises", async () => {
    const myModel = model({
      aa: Promise.resolve(true),
      bb() {
        return Promise.resolve(2);
      },
    });

    expect(myModel.aa.loading).toBeTruthy();
    await myModel.aa;
    expect(myModel.aa.loading).toBeFalsy();
    expect(myModel.bb.result).toBeUndefined();
    myModel.bb();
    expect(myModel.bb.result?.loading).toBeTruthy();
  });
});

describe("life cycle", () => {
  test("init", () => {
    const counter = model({
      count: 0,
      init() {
        this.count = 2;
      },
    });
    expect(counter.count).toBe(2);
  });

  test("dispose", () => {
    let disposed = false;
    const counter = model({
      count: 0,
      init() {
        this.count = 2;
        return () => {
          disposed = true;
        };
      },
    });
    expect(counter.count).toBe(2);
    dispose(counter);
    expect(disposed).toBeTruthy();
  });

  test("stale all props", () => {
    const log = jest.fn();
    const counter = model({
      get count1() {
        log("count1");
        return 1;
      },
      get count2() {
        log("count2");
        return 1;
      },
    });

    expect(log).toHaveBeenCalledTimes(0);
    counter.count1;
    counter.count1;
    counter.count2;
    counter.count2;
    expect(log).toHaveBeenCalledTimes(2);
    stale(counter);
    expect(log).toHaveBeenCalledTimes(2);
    counter.count1;
    counter.count2;
    expect(log).toHaveBeenCalledTimes(4);
  });

  test("auto refresh when specified events happened", () => {
    const events = model({ changed() {} });
    const values = [1, 2];
    const my = model({
      get data() {
        refresh(events.changed);
        return values.shift();
      },
    });
    expect(my.data).toBe(1);
    events.changed();
    expect(my.data).toBe(2);
  });

  test("conditional refresh", () => {
    const events = model({ changed(_value: boolean) {} });
    const values = [1, 2];
    const my = model({
      get data() {
        refresh(filter(events.changed, ([value]) => value));
        return values.shift();
      },
    });
    expect(my.data).toBe(1);
    events.changed(false);
    expect(my.data).toBe(1);
    events.changed(true);
    expect(my.data).toBe(2);
  });

  test("refresh", () => {
    const log = jest.fn();
    const counter = model({
      get count() {
        log("count");
        return 1;
      },
    });

    expect(log).toHaveBeenCalledTimes(0);
    counter.count;
    counter.count;
    expect(log).toHaveBeenCalledTimes(1);
    refresh(counter);
    expect(log).toHaveBeenCalledTimes(2);
    counter.count;
    expect(log).toHaveBeenCalledTimes(2);
  });

  test("refresh private prop", () => {
    const log = jest.fn();
    const counter = model({
      get _count() {
        log("_count");
        return 1;
      },
      get count() {
        return this._count;
      },
      refresh() {
        refresh(this, "_count");
      },
    });

    expect(log).toHaveBeenCalledTimes(0);
    counter.count;
    counter.count;
    expect(log).toHaveBeenCalledTimes(1);
    counter.refresh();
    expect(log).toHaveBeenCalledTimes(2);
  });
});

describe("computed", () => {
  test("self reference", () => {
    const counter = model({
      count: 1,
      get doubledCount() {
        return this.count * 2;
      },
      increment() {
        this.count++;
      },
    });

    expect(counter.doubledCount).toBe(2);
    counter.increment();
    expect(counter.doubledCount).toBe(4);
  });

  test("external reference", () => {
    const s1 = model({
      value: 1,
      get doubledValue() {
        return this.value * 2;
      },
      increment() {
        this.value++;
      },
    });
    const s2 = model({
      value: 2,
      increment() {
        this.value++;
      },
    });

    const sum = model({
      get value() {
        return s1.doubledValue + s2.value;
      },
    });

    expect(sum.value).toBe(4);
    s1.increment();
    expect(sum.value).toBe(6);
    s2.increment();
    expect(sum.value).toBe(7);
  });
});
