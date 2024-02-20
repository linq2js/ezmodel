# `ezmodel`

## Introduction

## Overview

ezmodel simplifies web application state management. It provides a clear API for both local and global states, making your code cleaner and more maintainable.

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

- Ease of Use: Straightforward setup.
- Reactivity: Seamless state-to-UI binding.
- Performance: Optimized for efficiency.

## Learn More

- [Core Concepts](./docs/core-concepts.md)
- [Advanced Topics](./docs/advanced-topics.md)
- [Deep Dives](./docs/deep-dives.md)
- [Comparative Analysis](./docs/comparative-analysis.md)
- [API Reference](./docs/api-reference.md)

## License

This project is licensed under the MIT License - see the [LICENSE](https://github.com/linq2js/ezmodel/blob/main/LICENSE) file for details.

## Community Support

For questions, discussions, or contributions, please join our community:

- **GitHub Issues:** For reporting bugs or requesting new features, please use [GitHub Issues](https://github.com/linq2js/ezmodel/issues).
- **Discussions:** Join the conversation and ask questions in [GitHub Discussions](https://github.com/linq2js/ezmodel/discussions).
- **Contribute:** Contributions are welcome! If you're interested in contributing, please read our [CONTRIBUTING](https://github.com/linq2js/ezmodel/blob/main/CONTRIBUTING.md) guide for more information on how to get started.

Stay connected and help improve `ezmodel` by sharing your feedback and ideas with the community!
