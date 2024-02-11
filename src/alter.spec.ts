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
});
