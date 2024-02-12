import { alter } from "./alter";
import { async } from "./async";
import { model, stale } from "./model";

describe("alter", () => {
  test("single model", () => {
    const array = model({ value: [] as number[] });
    alter(() => {
      array.value.push(1);
      array.value.push(2);
    });

    expect(array.value).toEqual([1, 2]);
  });

  test("multiple models", () => {
    const number = model({ value: 1 });
    const user = model({
      name: "Ging",
      company: { address: "abc", website: "xyz" },
    });

    alter(() => {
      number.value++;
      user.company.address = "new address";
    });

    expect(number.value).toBe(2);
    expect(user).toEqual({
      name: "Ging",
      company: { address: "new address", website: "xyz" },
    });
  });

  test("alter async: assign new value", () => {
    const user = model({ name: Promise.resolve("Ging") });
    expect(user.name.loading).toBeTruthy();
    alter(user, { name: async("New name") });
    expect(user.name.loading).toBeFalsy();
    expect(user.name.data).toBe("New name");
  });

  test("alter async: reduce previous value", async () => {
    const counter = model({ count: Promise.resolve(1) });
    expect(counter.count.loading).toBeTruthy();
    await counter.count;
    alter(counter, {
      count(prev) {
        return prev + 1;
      },
    });
    expect(counter.count.loading).toBeFalsy();
    expect(counter.count.data).toBe(2);
  });

  test("alter async: change value directly", async () => {
    const user = model({ company: Promise.resolve({ name: "abc" }) });
    expect(user.company.loading).toBeTruthy();
    alter(user, {
      company(prev) {
        prev.name = "def";
      },
    });
    expect(user.company.loading).toBeTruthy();
    await user.company;
    expect(user.company.loading).toBeFalsy();
    expect(user.company.data).toEqual({ name: "def" });
  });

  test("change readonly prop", () => {
    const count = model({ value: 1 });
    const doubledCount = model({
      get value() {
        return count.value * 2;
      },
    });
    expect(doubledCount.value).toBe(2);
    alter(doubledCount, { value: 3 });
    expect(doubledCount.value).toBe(3);
    count.value = 2;
    expect(doubledCount.value).toBe(4);
    alter(doubledCount, { value: 5 });
    expect(doubledCount.value).toBe(5);
    stale(doubledCount);
    expect(doubledCount.value).toBe(4);
  });

  test("nested models: 1 level", () => {
    const child = model({ name: "Ging" });
    const parent = model({ child });

    alter(() => {
      parent.child.name = "New name";
    });

    expect(parent.child).toBe(child);
    expect(child.name).toBe("New name");
  });

  test("nested models: N level", () => {
    const child = model({ name: "Ging" });
    const parent = model({ level1: { level2: { child } } });

    alter(() => {
      parent.level1.level2.child.name = "New name";
    });

    expect(parent.level1.level2.child).toBe(child);
    expect(child.name).toBe("New name");
  });
});
