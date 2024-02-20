# Deep Dives

## Model is just vanilla JS

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

## Understanding reactivity in nested Objects

In `ezmodel`, reactivity is the mechanism that automatically updates the UI or triggers effects when the state changes. However, this reactivity is only inherently applied to top-level properties of a model.

### Limitation with nested objects

When you have nested objects within your model, changes made directly to the properties of these nested objects do not automatically trigger reactivity. This is because ezmodel sets up reactivity proxies only at the top level by default.

### Best practices for managing nested state

**Flatten Your State Structure:** Where possible, avoid deeply nested structures. Flatter state structures are easier to manage, debug, and maintain reactivity. Consider redesigning your state shape if you find yourself frequently accessing deeply nested properties.

**Use alter for Nested Updates:** When you need to update nested properties and maintain reactivity, use the alter function. alter allows you to perform mutations on multiple properties, and once the mutation function exits, ezmodel will batch update all models that have been changed, ensuring reactivity is preserved.

```js
import { model, alter } from "ezmodel/react";

const person = model({ name: "Ging", company: { address: "abc" } });

// Using `alter` to update a nested property
alter(() => {
  person.company.address = "new address"; // Reactivity is preserved
});
```

`alter` is a function that takes a mutation function as an argument. Inside the mutation function, we can perform mutations on multiple properties of different models. Once exiting the mutation function, ezmodel will batch update all models that have been changed.

```js
import { model, alter } from "ezmodel/react";

const person = model({ name: "Ging", company: { address: "abc" } });
const product = model({ name: "Car", specs: { color: "white" } });

alter(() => {
  person.company.address = "new address";
  product.specs.color = "red";
});
```

**Clone and Re-Assign for Nested Updates:** Another approach to updating nested objects while triggering reactivity is to clone the nested object, modify it, and then re-assign it back to the parent object.

```js
const person = model({ name: "Ging", company: { address: "abc" } });

// Cloning, modifying, and re-assigning to maintain reactivity
person.company = { ...person.company, address: "new address" };
```

**Modeling Nested Structures:** For more complex scenarios, consider creating separate models for nested structures. This allows you to directly apply reactivity to nested objects.

```js
const company = model({ address: "abc" });
const person = model({ name: "Ging", company });

// Directly updating a nested model property
person.company.address = "new address"; // Reactivity is preserved
```
