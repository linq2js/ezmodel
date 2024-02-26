import { apply, model, once } from ".";

describe("middleware", () => {
  test("once", () => {
    const app = model({
      count: 1,
      increment() {
        this.count++;
      },
      init() {
        apply(this.increment, once());
      },
    });

    app.increment();
    app.increment();
    app.increment();
    app.increment();

    expect(app.count).toBe(2);
  });
});
