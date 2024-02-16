# `ezmodel`

## Introduction

`ezmodel` is an effective library for state management, equipped with two functions and two principles:

1. Always wrap your components with `view()`.
2. Always wrap your models with `model()`.

```js
import { model, view } from "ezmodel/react";

const app = model({ count: 0 });
const App = view(() => <div onClick={() => app.count++}>{app.count}</div>);
```

This ensures automatic updates to your views when necessary. The way you organize or modify your models is irrelevant; any syntactically valid code is effective.

### Compare to Jotai

```js
import { atom } from "jotai";

const countAtom = atom(0);

const App = () => {
  const [count, setCount] = useAtom(countAtom);
  return <div onClick={() => setCount((prev) => prev + 1)}>{app.count}</div>;
};
```

### Compare to Zustand

```js
import create from "zustand";

export const useStore = create((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
}));

const App = () => {
  const count = useStore((state) => state.count);
  const increment = useStore((state) => state.increment);
  return <div onClick={increment}>{count}</div>;
};
```

### Compare to Redux Toolkit

```js
import {
  useSelector,
  useDispatch,
  createSlice,
  configureStore,
} from "@reduxjs/toolkit";

const store = configureStore({ reducer: {} });

const counterSlice = createSlice({
  name: "counter",
  initialState: { value: 0 },
  reducers: {
    increment: (state) => {
      state.value += 1;
    },
  },
});

export const { increment } = counterSlice.actions;

const App = () => {
  const count = useSelector((state) => state.counter.value);
  const dispatch = useDispatch();
  return <div onClick={() => dispatch(increment)}>{count}</div>;
};

ReactDOM.render(
  <Provider store={store}>
    <App />
  </Provider>,
  document.getElementById("root")
);
```

## Table of contents

- [`ezmodel`](#ezmodel)
  - [Introduction](#introduction)
    - [Compare to Jotai](#compare-to-jotai)
    - [Compare to Zustand](#compare-to-zustand)
    - [Compare to Redux Toolkit](#compare-to-redux-toolkit)
  - [Table of contents](#table-of-contents)
  - [Installation](#installation)
  - [Basic Usages](#basic-usages)
    - [Creating a global models](#creating-a-global-models)
    - [Creating reactive view](#creating-reactive-view)
    - [Creating local models](#creating-local-models)
  - [Advanced Usages](#advanced-usages)
    - [Computed/derived model props](#computedderived-model-props)
      - [Pitfalls](#pitfalls)
    - [Strict mode](#strict-mode)
    - [Adding side effects](#adding-side-effects)
    - [Handling async data](#handling-async-data)
    - [Inheritance](#inheritance)
      - [Why shouldn't we use object spread operator?](#why-shouldnt-we-use-object-spread-operator)
    - [Handling action statuses](#handling-action-statuses)
    - [Model lifecycle](#model-lifecycle)
    - [Validating model properties](#validating-model-properties)
    - [Fine-grained reactivity](#fine-grained-reactivity)
    - [Persist models](#persist-models)
    - [Model is just vanilla JS](#model-is-just-vanilla-js)
  - [How `ezmodel` work](#how-ezmodel-work)
  - [API References](#api-references)
    - [model and model.strict](#model-and-modelstrict)
    - [effect](#effect)
    - [view](#view)
    - [refresh](#refresh)
    - [stale](#stale)

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
import { view } from "ezmodel/react";

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

The `model` can be used either globally or locally within a `view`.

```js
import { model } from "ezmodel";

// global model
const theme = model({ type: "dark" });

const App = view(() => {
  // local model
  const counter = model({ count: 0 });

  return <button onClick={() => counter.count++}>{counter.count}</button>;
});
```

## Advanced Usages

### Computed/derived model props

Computed model properties are a feature that allows us to declare a property whose value is derived from the values of other properties within the same model or from other models. To declare a computed property, we use the object getter syntax.

```js
import { model } from "ezmodel";

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
import { model } from "ezmodel";

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
import { model, refresh, stale } from "ezmodel";

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

#### Pitfalls

A model's computed property only re-computes when the related reactive values within it change. If a computed property references non-reactive variables from outside, we must manually call refresh whenever the external variables change.

```js
import { model } from "ezmodel";

let count = 0;

const counter = model({
  get count() {
    return count;
  },
  increment() {
    count++;
    refresh(this, "count"); // OR refresh(this)
  },
});
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
import { wait, model } from "ezmodel/react";
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
import { view } from "ezmodel/react";

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

### Inheritance

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
import { model } from "ezmodel";

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
import { model } from "ezmodel";

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

### Handling action statuses

Each model method is converted into an action object automatically. The action object has the following properties: `called`, `result`, `prevResult`, `error`, `loading`, `awaited` etc. Using these properties helps us understand the operational status of the action.

```js
import { model } from "ezmodel";

const app = model({
  synAction(payload) {
    return payload;
  },
  async asyncAction(payload) {
    return payload;
  },
  failAction() {
    throw new Error("failed");
  },
});

// handle sync action
console.log(app.syncAction.called); // the syncAction is not called yet
console.log(app.syncAction.result); // => undefined
const result1 = app.syncAction(1); // result1 = 1
console.log(app.syncAction.result); // => 1
console.log(app.syncAction.prevResult); // => undefined
app.syncAction(2);
console.log(app.syncAction.result); // => 2
console.log(app.syncAction.prevResult); // => 1

// handle async action
console.log(app.asyncAction.loading); // => false
app.asyncAction(1);
console.log(app.asyncAction.loading); // => true
// promise is pending
console.log(app.asyncAction.awaited); // => undefined
// wait a bit for promise fulfilled
console.log(app.asyncAction.loading); // => false
console.log(app.asyncAction.result); // => Promise(1)
// awaited contains value of fulfilled promise
console.log(app.asyncAction.awaited); // => 1

// handle error
try {
  app.failAction();
} catch (ex) {
  console.log(ex); // => Error('failed')
}

console.log(app.failAction.error); // => Error('failed')
console.log(app.failAction.result); // => undefined
```

When accessing action properties within a view, ezmodel will automatically track the action's status and re-render when there are changes.

```jsx
import { model, view } from "ezmodel/react";

const app = model({
  async submitData(data) {
    // code submit data here
  },
});

const Form = view(() => {
  return (
    <form action={app.submitData}>
      {app.submitData.loading && <div>Submitting...</div>}
      {app.submitData.error && <div>{app.submitData.error.message}</div>}
    </form>
  );
});
```

We can use the on function to listen for the dispatch of one or more actions.

```ts
import { model, on } from "ezmodel";

const app = model({
  action1(p1: number, p2: string) {},
  action2() {},
});

on(app.action1, (args /* args is [number, string] */) => {
  console.log("action1 dispatched");
});

on([app.action1, app.action2], (args /* args is any[] */) => {});
```

### Model lifecycle

A model has the following lifecycle stages:

- **init**: This stage occurs after the model object is created.
- **dispose**: This stage occurs when `dispose(model)` is called, or a local model is disposed of when the component unmounts.

```js
const app = model({
  // init
  init() {
    // the dispose function is optional
    return () => {
      // dispose
    };
  },
});
```

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

To control the rendering of small parts within a large component without creating many child components, we apply the technique of fine-grained reactivity.

```js
import { rx } from "ezmodel/react";

const profile = model({ name: "Ging", age: 100 });

// no need to wrap with view(), when profile changed, it does not make ProfilePage re-renders
const ProfilePage = () => {
  // a lot of hooks here
  useSomething();
  useSomething();
  useSomething();

  return (
    <>
      <div>Name: {rx(() => profile.name)}</div>
      <div>Age: {rx(() => profile.age)}</div>
      <OtherComp />
    </>
  );
};
```

### Persist models

`ezmodel` provides `load` and `save` options to persist the state of the model. The `load` function returns the persisted state of the model, and the model will use the values of properties returned from the `load` function, while other properties retain their default values. The `save` function is called whenever there are changes to any properties of the model.

```js
// Assuming the saved app state includes only prop1 and prop2.
localStorage.setItem("app", JSON.stringify({ prop1: 1, prop2: 2 }));

const app = model(
  { prop1: 0, prop2: 0, prop3: 3 },
  {
    load() {
      return JSON.parse(localStorage.getItem("app")) || {};
    },
    save(state) {
      localStorage.setItem("app", JSON.stringify(state));
    },
  }
);

console.log(app.prop1); // 1
console.log(app.prop2); // 2
console.log(app.prop3); // 3
```

### Model is just vanilla JS

The model is purely vanilla JavaScript and can operate universally, including on the server side. This allows for seamless sharing of logic between server and client sides or across libraries.

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

## How `ezmodel` work

## API References

### model and model.strict

### effect

### view

### refresh

### stale
