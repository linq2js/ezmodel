import { disposable } from "./disposable";
import { group } from "./group";

describe("group", () => {
  test("primitive type keyed", () => {
    const numbers = group((key: number) => key * 2);
    expect(numbers(1)).toBe(2);
    expect(numbers(2)).toBe(4);
    expect(numbers.size).toBe(2);
  });

  test("object type keyed", () => {
    const users = group((key: { id: number }) => ({
      id: key.id,
      name: `user${key.id}`,
    }));
    const u1 = users({ id: 1 });
    const u2 = users({ id: 1 });
    expect(users.size).toBe(1);
    expect(u1).toBe(u2);
  });

  test("custom selector", () => {
    const numbers = group(
      (key: number) => key * 2,
      (value) => value.toString()
    );
    expect(numbers(1)).toBe("2");
    expect(numbers(2)).toBe("4");
  });

  test("auto dispose", () => {
    const log = jest.fn();
    const numbers = group((key: number) => {
      disposable()?.add(log);
      return key * 2;
    });
    expect(numbers(1)).toBe(2);
    expect(numbers(2)).toBe(4);
    numbers.delete(1);
    expect(log).toHaveBeenCalledTimes(1);
    numbers.delete(2);
    expect(log).toHaveBeenCalledTimes(2);
    expect(numbers.size).toBe(0);
  });
});
