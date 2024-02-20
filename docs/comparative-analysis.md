# Comparative Analysis

## Ezmodel

```js
import { model, view } from "ezmodel/react";

const app = model({
  count: 0,
  get doubledCount() {
    return this.count * 2;
  },
});
const App = view(() => (
  <div onClick={() => app.count++}>{app.doubledCount}</div>
));
```

## Jotai

```js
import { atom } from "jotai";

const countAtom = atom(0);
const doubledCountAtom = atom((get) => get(countAtom) * 2);

const App = () => {
  const [, setCount] = useAtom(countAtom);
  const [doubledCount] = useAtom(doubledCountAtom);

  return <div onClick={() => setCount((prev) => prev + 1)}>{doubledCount}</div>;
};
```

## Zustand

```js
import create from "zustand";

export const useStore = create((set, get) => ({
  count: 0,
  // unlike ezmodel, this getter is not cached for subsequent access
  get doubledCount() {
    return get().count * 2;
  },
  increment: () => set((state) => ({ count: state.count + 1 })),
}));

const App = () => {
  const doubledCount = useStore((state) => state.doubledCount);
  const increment = useStore((state) => state.increment);
  return <div onClick={increment}>{doubledCount}</div>;
};
```

## Redux Toolkit

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
  initialState: { value: 0, doubledValue: 0 },
  reducers: {
    increment: (state) => {
      state.value += 1;
      // Computation logic must be incorporated into all reducers that affect the value
      state.doubledValue = state.value * 2;
    },
    decrement(state) {
      state.value -= 1;
      // Computation logic must be incorporated into all reducers that affect the value
      state.doubledValue = state.value * 2;
    },
  },
});

export const { increment } = counterSlice.actions;

const App = () => {
  const count = useSelector((state) => state.counter.doubledValue);
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
