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

#### Conditional rendering

Unlike other state management libraries, `ezmodel` simplifies working with conditional operations, conditional rendering, and IF conditions, removing the requirement to connect to all related stores before evaluating their values.

```js
// other lib
const ProducePrice = () => {
  const price = useAtom(priceAtom);
  const applyDiscount = useAtom(applyDiscountAtom);
  const discount = useAtom(discountAtom);

  return <div>Price: {applyDiscount ? price * discount : price}</div>;
};

// with ezmodel
const applyDiscount = model({ value: true });
const price = model({ value: 1000 });
const discount = model({ value: 0.8 });

const ProducePrice = view(() => {
  return (
    <div>
      Price: {applyDiscount.value ? price.value * discount.value : price.value}
    </div>
  );
});
```

#### Highly rendering optimization

### Creating local models

## Using model shape factory

## Advanced Usages

### Strict mode

### Adding side effects

### Multiple inheritance

### Handle async action dispatching

### Computed/derived properties

### Initializing and disposing events

### Listening action dispatches

### Fine-grained reactivity

### Tagging models

## API References

### model

### model.strict

### from

### effect

### tag

### view
