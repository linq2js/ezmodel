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

// changing character age does not trigger reactive effect
character.age = 40;
// the CharacterInfo will re-render when character name has been changed only
character.name = "Ging Freecss";
```

With this approach, `ezmodel` helps to reduce code complexity by eliminating the need for excessive use of hooks (like useStore, useSelector, useModel, useAtom) commonly required by other libraries.

We also don't need to use hooks to obtain actions/dispatchers as in `Redux`. Everything is declared within the model, and executing a model method is as straightforward as calling a normal function.

```js
const Jump = () => {
  return <button onClick={character.jump}>Jump</button>;
};
```

### Model is vanilla JS

### Creating local models

## Using model props factory

## Advanced Usages

### Computed/derived model props

Computed model properties are a feature that allows us to declare a property whose value is derived from the values of other properties within the same model or from other models. To declare a computed property, we use the object getter syntax.

```js
const counter = model({
  count: 1,
  // the doubledCount property consumes count property. When the count property changed, the doubledCount property will re-compute as well
  get doubledCount() {
    return this.count * 2;
  },
});

const a = model({ value: 1 });
const b = model({ value: 2 });
const sum = model({
  // the computed property can also consume properties from other models
  get value() {
    return a.value + b.value;
  },
});
```

Computed properties can include complex calculations that are only executed when the computed property is accessed. Additionally, computed properties memoize the results for subsequent accesses, preventing the calculation function from being called again.

```js
const my = model({
  otherValue: 1,
  get doHeavyComputation() {
    return something;
  },
});

// at this time, doHeavyComputation is not executed yet
console.log(my.otherValue);
// the doHeavyComputation is called until there is access to
console.log(my.doHeavyComputation);
// and the result is cached for next access
console.log(my.doHeavyComputation);
console.log(my.doHeavyComputation);
console.log(my.doHeavyComputation);
```

### Strict mode

### Adding side effects

### Multiple inheritance

### Handle async action dispatching

### Initializing and disposing events

### Listening action dispatches

### Fine-grained reactivity

### Tagging models

### Staling model props

### Refreshing model props

## API References

### model

### model.strict

### from

### effect

### tag

### view

### refresh

### stale
