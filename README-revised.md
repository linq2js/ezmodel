# `ezmodel`

## Introduction

## Overview

`ezmodel` simplifies web application state management. It provides a clear API for both local and global states, making your code cleaner and more maintainable.

## Getting Started

### Installation

Using `npm`

```bash
npm i ezmodel
```

Using `yarn`

```bash
yarn add ezmodel
```

### Quick Start Guide

Wrap components with `view()`, define states with `model()` and using `effect()` to detect model change.

```js
import { model, effect } from "ezmodel";
import { view } from "ezmodel/react";

const counter = model({ count: 0 });

effect(() => {
  console.log("count", counter.count);
});

const App = view(() => (
  <button onClick={() => counter.count++}>{counter.count}</button>
));
```

## Features

- **Ease of Use:** Straightforward setup.
- **Reactivity:** Seamless state-to-UI binding.
- **Performance:** Optimized for efficiency.

## Showcase

<details>
    <summary><strong>Defining model methods</strong></summary>

Use object shorthand syntax to define model methods.

```js
import { model } from "ezmodel";

const app = model({
  count: 1,
  increment() {
    this.count++;
  },
  incrementBy(by) {
    this.count += by;
  },
});
```

</details>

<details>
    <summary><strong>Defining model computed properties</strong></summary>

Computed properties are object properties that contain expressions with reactive dependencies on model properties or other computed properties. When any of these reactive dependencies are updated, the computed properties will automatically re-calculate. This implies that computed properties will be memoized, allowing for efficient subsequent access.

```js
import { model } from "ezmodel";

const module1 = model({ value: 1 });
const module2 = model({ value: 2 });
const module3 = model({
  factor: 2,
  // computed properties
  get sum() {
    return (
      // internal reactive value
      this.factor *
      // external reactive values
      (module1.value + module2.value)
    );
  },
});

console.log(module3.sum); // 6
console.log(module3.sum); // the module3.sum is invoked once
module1.value++; // the module3.sum re-computes
module2.value++; // the module3.sum re-computes
module3.factor++; // the module3.sum re-computes
```

</details>

<details>
    <summary><strong>Using immutable data for mutating model</strong></summary>

Similar to other state management libraries, `ezmodel` enforces the use of immutable data when mutating model properties.

```js
import { model } from "ezmodel";

const app = model({
  todos: [],
});

// 🔴  DON'T
app.todos.push({ title: "new todo" });

// 🟢 DO
app.todos = [...app.todos, { title: "new todo" }];
```

To simplify the mutation of nested objects, the `alter` function can be utilized. This function operates similarly to the "produce" function of Immer, but it possesses additional characteristics.

```js
import { model, alter } from "ezmodel";

const app = model({
  count: 0,
  modifiedAt: undefined,
  todos: [],
  addTodo(title) {
    // If a mutation function is passed, all model accesses are drafted by Immer.
    alter(() => {
      // mutate an array
      this.todos.push({ title });
      // we also can do mutation on multiple models at once
      otherModel.todos.push({ title });
    });

    // Alternatively, a mutation map can be passed, which has the same structure as the model properties.
    alter(this, {
      modifiedAt: new Date(),
      // return a new value
      count: (prev) => prev + 1,
      // mutate draft object
      todos: (todos) => {
        todos.push({ title });
      },
    });
  },
});
```

</details>

## Learn More

- [API Reference](./docs/api-reference.md)

## License

This project is licensed under the MIT License - see the [LICENSE](https://github.com/linq2js/ezmodel/blob/main/LICENSE) file for details.

## Community Support

For questions, discussions, or contributions, please join our community:

- **GitHub Issues:** For reporting bugs or requesting new features, please use [GitHub Issues](https://github.com/linq2js/ezmodel/issues).
- **Discussions:** Join the conversation and ask questions in [GitHub Discussions](https://github.com/linq2js/ezmodel/discussions).
- **Contribute:** Contributions are welcome! If you're interested in contributing, please read our [CONTRIBUTING](https://github.com/linq2js/ezmodel/blob/main/CONTRIBUTING.md) guide for more information on how to get started.

Stay connected and help improve `ezmodel` by sharing your feedback and ideas with the community!
