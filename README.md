# `ezmodel`

## Introduction

`ezmodel` is an effective library for state management, equipped with two functions and two principles:

1. Always wrap your components with `view()`.
2. Always wrap your models with `model()`.

```js
import React from "react";
import { model } from "ezmodel";
import { view } from "ezmodel/react";

const counter = model({ count: 0 });

const App = view(() => (
  <button onClick={() => counter.count++}>{counter.count}</button>
));
```

This ensures automatic view updates as required. The structure or mutation of your state models is irrelevant; any syntactically correct code is effective.

## Installation

NPM

```bash
npm i ezmodel
```

YARN

```bash
yarn add ezmodel
```

## Basic Usages

### Creating a global models

The `model()` function takes a plain object as input and returns a JavaScript proxy with a similar structure to the input object. Reading and writing properties of the model are performed normally as with a plain object.

```js
import { model } from "ezmodel";

const character = model({
  name: "Ging",
  age: 30,
  jump() {
    console.log("jumping");
  },
});
console.log(character.name, character.age); // Ging, 30
// updating object properties
character.name = "Ging Freecss";
character.age = 40;
console.log(character.name, character.age); // Ging Freecss, 40
// calling object method
character.jump(); // jumping
```

### Creating reactive view

The `ezmodel` `view` is a higher-order component that takes a render function as an argument and returns a component wrapper. The render function is executed during the rendering process of the component wrapper. Every access to any model property is tracked, and the component wrapper will re-render whenever any of those model properties change.

```js
const CharacterInfo = view(() => {
  // read name from character
  return <div>{character.name}</div>;
});

// Modifying the character's age does not activate the reactive effect.
character.age = 40;
// The CharacterInfo will re-render only when the character's name has been changed.
character.name = "Ging Freecss";
```

With this approach, `ezmodel` helps to reduce code complexity by eliminating the need for excessive use of hooks (like useStore, useSelector, useModel, useAtom) commonly required by other libraries.

We also don't need to use hooks to obtain actions/dispatchers as in `Redux`. Everything is declared within the model, and executing a model method is as straightforward as calling a normal function.

```js
const Jump = () => {
  return <button onClick={character.jump}>Jump</button>;
};
```

### Creating local models

## Using model props factory

## Advanced Usages

### Computed/derived model props

Computed model properties are a feature that allows us to declare a property whose value is derived from the values of other properties within the same model or from other models. To declare a computed property, we use the object getter syntax.

```js
const counter = model({
  count: 1,
  // The doubledCount property utilizes the count property. When the count property changes, the doubledCount property will also re-compute.
  get doubledCount() {
    return this.count * 2;
  },
});

const a = model({ value: 1 });
const b = model({ value: 2 });
const sum = model({
  // The computed property can also utilize properties from other models.
  get value() {
    return a.value + b.value;
  },
});
```

Computed properties can include complex calculations that are only executed when the computed property is accessed. Additionally, computed properties memoize the results for subsequent accesses, preventing the calculation function from being called again.

```js
const app = model({
  otherValue: 1,
  get doHeavyComputation() {
    return something;
  },
});

// At this time, `doHeavyComputation` has not been executed yet.
console.log(app.otherValue);
// `doHeavyComputation` is called only when there is access to it.
console.log(app.doHeavyComputation);
// And the result is cached for subsequent access.
console.log(app.doHeavyComputation);
console.log(app.doHeavyComputation);
console.log(app.doHeavyComputation);
```

To force `ezmodel` to re-compute the values of computed properties, we can use the `refresh()` or `stale()` functions.

```js
import { refresh, stale } from "ezmodel";

const app = model({
  get todos() {
    return fetch("https://jsonplaceholder.typicode.com/todos").then((res) =>
      res.json()
    );
  },
  get user() {
    return fetch("https://jsonplaceholder.typicode.com/users/1").then((res) =>
      res.json()
    );
  },
});

// re-compute immediately
refresh(app, "todos");
// mark todos property as stale, the computation will be executed for subsequent access of app.todos
stale(app, "todos");

// refresh todos and user properties
refresh(app, ["todos", "user"]);
```

### Strict mode

With Strict mode, all model properties become readonly, and modifying property values is only permitted within model methods. External modifications outside of model methods are prohibited. This encapsulates/centralizes the logic within model methods, avoiding scattered model mutations across various locations.

```js
// using strict mode with model.strict
const counter = model.strict({
  count: 1,
  increment() {
    this.count++;
  },
});

// getting error if trying to modify count property outside model method
counter.count++; // get Typescript error
counter.increment(); // OK
```

### Adding side effects

Utilize `effect()` to automatically respond to changes in your models. The effects are intended for final-stage logic, such as updating the document title or saving data to LocalStorage. view is a unique auto effect specifically designed for rendering purposes. `You must not do any model mutations inside effects`.

```js
import { model, effect } from "ezmodel";

const counter = model({ count: 1 });

// effect is triggered immediately after creation
// count: 1
const removeEffect = effect(() => {
  console.log(`count: ${counter.count}`);
});

counter.count++; // count: 2
removeEffect();
counter.count++; // no log
```

### Handling async data

`ezmodel` provides a `wait()` function for handling asynchronous data. `wait()` takes one or more Promise objects and will return the resolved data if the Promise is fulfilled, or throw an error if the Promise is rejected, and will throw the Promise object itself if it is still pending. The nearest `Suspense` and `ErrorBoundary` wrappers will catch the outcomes of `wait()` and proceed to render the corresponding fallback.

```jsx
import { wait, model } from "ezmodel";
import { view } from "ezmodel/react";
import { ErrorBoundary } from "react-error-boundary";

const app = model({
  get todos() {
    // fetch todo list
    return fetch("https://jsonplaceholder.typicode.com/todos").then((res) =>
      res.json()
    );
  },
});

const TodoList = view(() => {
  // return array of todos, no async operator needed
  const todos = wait(app.todos);

  return (
    <>
      {todos.map((todo) => (
        <TodoItem key={todo.id} todo={todo} />
      ))}
    </>
  );
});

const App = () => {
  return (
    <ErrorBoundary fallback="Something went wrong">
      <Suspense fallback="Loading...">
        <TodoList />
      </Suspense>
    </ErrorBoundary>
  );
};
```

We can also manually handle statuses (`loading`, `error`) of asynchronous data.

```jsx
const TodoList = view(() => {
  if (app.todos.loading) {
    // custom loading indicator
    return <div>Loading...</div>;
  }

  // custom error
  if (app.todos.error) {
    return <div>Something went wrong</div>;
  }

  // read data from todos prop
  const todos = app.todos.data;

  return (
    <>
      {todos.map((todo) => (
        <TodoItem key={todo.id} todo={todo} />
      ))}
    </>
  );
});
```

> Note: All Promise objects stored within a model property or returned as a result of a model method are converted into an `AsyncResult` object. `AsyncResult` is a wrapper for promise objects, pre-equipped with the following properties: `loading`, `data`, and `error`. This makes controlling the state of a Promise more straightforward. When the properties of `AsyncResult` are accessed within view(), the view will track changes to the `AsyncResult` and re-render accordingly.

### Inheritance and props builder

In practice, using inheritance techniques helps make the code clearer and simpler. `ezmodel` provides basic support for inheritance.

```js
import { model } from "ezmodel";

const shape = model({ color: "white" });
const polygon = model(
  // base props
  shape,
  // polygon props
  () => ({
    sides: 0,
    display() {
      console.log(
        `A polygon with ${this.sides} sides and color ${this.color}.`
      );
    },
  })
);
const triangle = model(
  polygon,
  // triangle props
  () => ({
    // override props of polygon
    color: "red",
    sides: 3,
  })
);

triangle.display(); // A polygon with 3 sides and color red.
```

We can also create models with properties inherited from multiple other models.

```js
const canEat = model({
  eat() {
    console.log("eating");
  },
});

const canRun = model({
  run() {
    console.log("running");
  },
});

const person = model(
  // base models
  [canEat, canRun],
  () => ({
    name: "Ging",
  })
);

person.eat(); // eating
person.run(); // running
person.name; // Ging
```

#### Why shouldn't we use object spread operator?

When you use the object spread operator, all properties with custom getters must be evaluated before copying, which can be inefficient and may lead to unintended side effects. In contrast, `ezmodel` uses `Object.getOwnPropertyDescriptors` to read all properties of one or more objects while skipping the execution of object getters.

```js
const machine = model({
  get heavyComputation() {},
});

const human = model({
  get fetchingLogic() {},
});

const cyborg = model({
  ...machine, //heavyComputation invoked
  ...human, // fetchingLogic invoked
});
```

### Handling async action dispatching

### Model lifecycle

### Listening action dispatches

### Validating model properties

With `ezmodel`, we can define validation for each property of the model. Validation is executed whenever the value of a model property changes.

```js
const counter = model(
  { count: 1 },
  {
    rules: {
      // validation function for count prop
      count(value) {
        if (!value) throw new Error("Invalid count");
      },
      // ...other rules here
    },
  }
);

counter.count = 0; // getting `Invalid count` error
```

The validation function can also return `false` if the input value is invalid, and `ezmodel` will automatically throw an `"Invalid '{propName}' value"` error.

```js
const counter = model({ count: 1 }, { rules: { count: (value) => value > 0 } });

counter.count = 0; // getting `Invalid 'count' value` error
```

`ezmodel` can also work with other validation libraries like `yup` or `zod`.

```js
const counter = model(
  { count: 1 },
  { rules: { count: z.coerce.number().min(1) } }
);
// try to assign string instead number and zod will convert the value to number and does validation
counter.count = "2";
expect(counter.count).toBe(2);
```

### Fine-grained reactivity

### Tagging models

### Model is just vanilla JS

The model is purely vanilla JavaScript and can operate universally, including on the server side. This allows for seamless sharing of logic between server and client sides.

```ts
import { model } from "ezmodel";
import { z } from "zod";

/**
 * this logic can be shared between client and server
 */
const createTodo = (props: { id: number; title: string }) => {
  return model(props, {
    // define validation rules for id and title
    rules: { id: z.number(), title: z.string() },
  });
};
```

## API References

### model

### model.strict

### effect

### tag

### view

### refresh

### stale

### useStable
