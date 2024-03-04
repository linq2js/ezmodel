module.exports = {
  rootDir: __dirname,
  verbose: false,
  testEnvironment: "jsdom",
  cacheDirectory: "<rootDir>/jest_cache",
  moduleFileExtensions: ["js", "ts", "tsx"],
  restoreMocks: true,
  testMatch: ["<rootDir>/src/**/?(*.)spec.{js,ts,tsx}"],
  testPathIgnorePatterns: [
    "<rootDir>/node_modules",
    "/node_modules/",
    "/dist/",
  ],
  slowTestThreshold: 100,
  setupFiles: ["<rootDir>/beforeTest.js"],
  transformIgnorePatterns: [],
  transform: {
    "^.+\\.(t|j)sx?$": ["@swc/jest"],
  },
};
