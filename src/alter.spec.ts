import { alter } from "./alter";
import { model } from "./model";

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

  // test("nested model 1 level", () => {
  //   const child = model({ name: "child" });
  //   const parent = model({ child });
  //   alter(() => {
  //     parent.child.name = "New name";
  //   });

  //   expect(child.name).toBe("New name");
  //   expect(parent.child.name).toBe("New name");
  //   expect(parent.child).toBe(child);
  // });

  // test("nested model: unset", () => {
  //   const child = model({ name: "child" });
  //   const parent = model({ child });
  //   alter(() => {
  //     delete (parent as any).child;
  //   });

  //   expect(parent.child).toBeUndefined();
  // });

  // test("nested model 2 level", () => {
  //   const child = model({ name: "child" });
  //   const parent = model({ level1: { level2: { child } } });
  //   alter(() => {
  //     parent.level1.level2.child.name = "New name";
  //   });

  //   expect(child.name).toBe("New name");
  //   expect(parent.level1.level2.child.name).toBe("New name");
  //   expect(parent.level1.level2.child).toBe(child);
  // });
});
