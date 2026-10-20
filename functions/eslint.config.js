// ESLint flat config for the Firebase functions package.
// Lives here (not only at the repo root) so ESLint's nearest-config lookup
// stops at functions/ instead of picking up the extension's config.

const js = require("@eslint/js");
const globals = require("globals");
const tseslint = require("typescript-eslint");
const importPlugin = require("eslint-plugin-import");
const googleStyle = require("eslint-config-google");

// valid-jsdoc and require-jsdoc were removed from ESLint core in v9, so the
// google config can no longer load them. Dropped, not replaced with a plugin.
const removedInEslint9 = ["valid-jsdoc", "require-jsdoc"];
const googleRules = Object.fromEntries(
  Object.entries(googleStyle.rules)
    .filter(([name]) => !removedInEslint9.includes(name)),
);

module.exports = [
  {
    ignores: [
      "lib/**", // Compiled output of `tsc`.
      "generated/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  importPlugin.flatConfigs.errors,
  importPlugin.flatConfigs.warnings,
  importPlugin.flatConfigs.typescript,
  {
    files: ["**/*.{js,ts}"],
    languageOptions: {
      ecmaVersion: 2018,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.es2015,
      },
    },
    rules: {
      ...googleRules,
      "quotes": ["error", "double"],
      "indent": ["error", 2],
      "import/no-unresolved": "off",
      // typescript-eslint v8 moved this to recommended; the v5 recommended set
      // this package used before did not include it. The config file is CJS.
      "@typescript-eslint/no-require-imports": "off",
      // Kept at "warn" as in the v5 recommended set this package used before,
      // and as in the root eslint.config.js.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];
