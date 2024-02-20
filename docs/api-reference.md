# API Reference

## Namespaces

- `ezmodel`: APIs for vanilla JS (`model`, `effect`, `alter` etc.)
- `ezmodel/react`: APIs for React (`view`, `rx`), including all vanilla JS API

## model(props, options: ModelOptions): Model

Creates a model instance with the specified properties and options.

- **Parameters:**
  - props: The properties to initialize the model with.
  - options: Configuration options for the model creation.
- **Returns:** An instance of Model.

## model.strict(props, options: ModelOptions): Model

Similar to model, but enforces all properties are readonly.

- **Parameters**:
  - props: The properties to initialize the model with.
  - options: Configuration options for the model creation.
- **Returns:** An instance of Model with strict behavior.

## effect(fn: Function): Function

Defines an effect function that is executed as a side effect.

- **Parameters:**
  - fn: The function to execute as an effect.
- **Returns:** A function that can be called to remove the effect.

## view(render: (props) => ReactNode): FunctionComponent

Creates a React functional component using the provided render function.

- **Parameters:**
  - render: A function that returns ReactNode based on the given props.
- **Returns:** A React FunctionComponent.

## refresh()

Forces a refresh/update of all properties for given model.

- **Overloads:**

  - refresh(model, prop): Refreshes a specific property of the model.
  - refresh(model, props): Refreshes multiple properties of the model.
  - refresh(models): Refreshes multiple models.

- **Parameters:**
  - model: The model to refresh.
  - prop: A single property name to refresh.
  - props: An array of property names to refresh.
  - models: An array of models to refresh.

## stale()

Marks the given model or its properties as stale, indicating that they need to be re-evaluated or refreshed.

- **Overloads:**

  - stale(model, prop): Marks a specific property of the model as stale.
  - stale(model, props): Marks multiple properties of the model as stale.
  - stale(models): Marks multiple models as stale.

- **Parameters:**
  - model: The model to mark as stale.
  - prop: A single property name to mark as stale.
  - props: An array of property names to mark as stale.
  - models: An array of models to mark as stale.
