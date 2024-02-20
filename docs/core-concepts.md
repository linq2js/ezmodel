# Core Concepts

## Creating a global models

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

## Creating reactive view

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

## Creating local models

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

## You might not need useState, useRef, useMemo, useCallback

A local model can serve as an alternative to using useState, useRef, useMemo, and useCallback, eliminating concerns regarding hook dependencies.

### Alternative of useState()

```js
const [count, setCount] = useState(0);
return <button onClick={() => setCount(count + 1)}>{count}</button>;

// EQUIVALENT TO
const local = model({ count: 1 });
return <button onClick={() => local.count++}>{count}</button>;
```

### Alternative of `useRef`

```ts
const intervalIdRef = useRef<any>();
const handleStart = () => {
  intervalIdRef.current = setInterval(() => {});
};

// EQUIVALENT TO
const local = model({ intervalId: undefined as any });
// if the model prop has no access in rendering phase, it is similar to useEef value
const handleStart = () => {
  local.intervalId = setInterval(() => {});
};
```

### Alternative of `useCallback`

```tsx
const ProductPage = (props) => {
  // value comes from another hook
  const productRoute = useProductRoute();
  const handleSubmit = useCallback(
    (orderDetails) => {
      post(productRoute + props.productId + "/buy", {
        referrer: props.referrer,
        orderDetails,
      });
    },
    [productRoute, props.productId, props.referrer]
  );
};

// EQUIVALENT TO
const ProductPage = view((props) => {
  // value comes from another hook
  const productRoute = useProductRoute();
  const local = model(
    {
      productRoute,
      submit(orderDetails) {
        // props is stable
        post(this.productRoute + props.productId + "/buy", {
          referrer: props.referrer,
          orderDetails,
        });
      },
    },
    // Ensure that the productRoute stays updated during component re-rendering
    { unstable: { productRoute: true } }
  );
});
```

### Alternative of `useMemo`

```js
const [state, setState] = sueState("");
const resultOfOtherHook = useOtherHook();
const computedValue = useMemo(() => {
  return state + resultOfOtherHook + props.value;
}, [state, props.value, resultOfOtherHook]);

// EQUIVALENT TO
const local = model(
  {
    state: "",
    propValue: props.value,
    resultOfOtherHook,
    get computedValue() {
      return state + this.resultOfOtherHook + this.propValue;
    },
  },
  { unstable: { resultOfOtherHook: true, propValue: true } }
);
```

The key difference is that `model.computedValue` is not evaluated immediately upon access, whereas useMemo performs computation right away, which could affect rendering performance.
