import { alter } from "./alter";
import { filter } from "./emitter";
import {
  dispose,
  refresh,
  stale,
  model,
  previous,
  original,
  peek,
  isModel,
} from "./model";
import { z } from "zod";

describe("basic usages", () => {
  test("getting value", () => {
    const counter = model({ count: 1 });

    expect(counter.count).toBe(1);
  });

  test("keys", () => {
    const app = model({ a: 1, b: 2, c: 3 });
    expect(Object.keys(app)).toEqual(["a", "b", "c"]);
  });

  test("entries", () => {
    const app = model({ a: 1, b: 2, c: 3 });
    expect(Object.entries(app)).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]);
  });

  test("serialize", () => {
    const counter = model({ count: 1 });
    counter.count++;
    expect(JSON.stringify(counter)).toBe('{"count":2}');
  });

  test("should not allow to delete model prop", () => {
    const app = model({ a: 1, b: 2, c: 3 }) as any;
    expect(() => {
      delete app.a;
    }).toThrow();
  });

  test("validate with manual validation function", () => {
    const counter = model(
      { count: 1, doSomething() {} },
      { rules: { count: (value) => value > 0 } }
    );
    expect(() => (counter.count = 0)).toThrow("Invalid 'count' value");
  });

  test("validate with zod without transform", () => {
    const counter = model(
      { count: 1 },
      { rules: { count: z.number().min(1) } }
    );
    expect(() => (counter.count = 0)).toThrow();
  });

  test("validate with zod with transform", () => {
    const counter = model(
      { count: 1 },
      { rules: { count: z.coerce.number().min(1) } }
    );
    // zod will convert string to number and do validation
    (counter as any).count = "2";
    expect(counter.count).toBe(2);
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

  test("custom setter", () => {
    const app = model({
      todos: [{ done: true }, { done: false }],
      get allDone() {
        return this.todos.every((x) => x.done);
      },
      set allDone(value) {
        alter(() => {
          this.todos.forEach((x) => (x.done = value));
        });
      },
    });

    expect(app.allDone).toBeFalsy();
    app.allDone = true;
    expect(app.allDone).toBeTruthy();
    app.allDone = false;
    expect(app.allDone).toBeFalsy();
    expect(app.todos[0].done).toBeFalsy();
    expect(app.todos[1].done).toBeFalsy();
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

  test("load model", () => {
    const log = jest.fn();
    const app = model(
      { prop1: 1, prop2: 2 },
      {
        load() {
          log("load");
          return { prop1: 3 };
        },
      }
    );

    // load function should not called when model is created
    expect(log).not.toHaveBeenCalled();
    expect(app.prop2).toBe(2); // use default value for prop2 if there is no persisted data
    // load function should be called after model has first prop access
    expect(log).toHaveBeenCalled();
    expect(app.prop1).toBe(3);
  });

  test("save model", () => {
    const log = jest.fn();
    const app = model(
      { count1: 1, count2: 2 },
      {
        save(m) {
          log(JSON.stringify(m));
        },
      }
    );
    app.count1++;
    expect(log).toHaveBeenLastCalledWith('{"count1":2,"count2":2}');
    app.count2++;
    expect(log).toHaveBeenLastCalledWith('{"count1":2,"count2":3}');
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

describe("copy", () => {
  test("clone one", () => {
    const parent = model({ count: 1 });
    const child = model(parent);
    expect(child.count).toBe(1);
    child.count++;
    // the change from child does not impact the parent
    expect(parent.count).toBe(1);
  });
});

describe("class", () => {
  test("class", () => {
    class Animal {
      get name() {
        return "animal";
      }

      run() {
        return true;
      }
    }

    class Bird extends Animal {
      get name() {
        return "bird";
      }
    }

    const bird = model(Bird);
    expect(bird.run()).toBeTruthy();
    expect(bird.name).toBe("bird");
    expect(JSON.stringify(bird)).toBe('{"name":"bird"}');
  });
});

describe("accessor", () => {
  test("previous: normal prop", () => {
    const app = model({ count: 1 });
    app.count++;
    app.count++;
    expect(previous(() => app.count)).toBe(2);
    expect(original(() => app.count)).toBe(1);
  });

  test("previous: computed prop", () => {
    const app = model({
      count: 1,
      get doubledCount() {
        return this.count * 2;
      },
    });
    app.count++;
    app.count++;
    // for computed property, original === current === previous
    expect(original(() => app.doubledCount)).toBe(6);
    expect(previous(() => app.doubledCount)).toBe(6);
  });

  test("peeking", () => {
    const app = model({
      count: 1,
      get doubledCount() {
        return peek(() => this.count) * 2;
      },
    });
    expect(app.doubledCount).toBe(2);
    app.count++;
    app.count++;
    expect(app.doubledCount).toBe(2);
    expect(app.doubledCount).toBe(2);
    expect(app.doubledCount).toBe(2);
    refresh(app, "doubledCount");
    expect(app.doubledCount).toBe(6);
  });
});
