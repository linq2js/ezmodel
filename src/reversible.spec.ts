import { model } from "./model";
import { reversible } from "./reversible";

describe("reversible", () => {
  test("revert", () => {
    const app = model({ p1: 1, p2: 2 });

    const [{ revert }] = reversible(() => {
      app.p1 = 2;
    });

    expect(app.p1).toBe(2);
    revert();
    expect(app.p1).toBe(1);
  });
});
