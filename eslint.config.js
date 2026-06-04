import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import react from "eslint-plugin-react";

/**
 * Flat ESLint config. Goal: catch real mistakes and the Koshyk anti-patterns
 * without drowning a previously-unlinted codebase in churn. Architecture
 * regressions are hard-failed by scripts/check-patterns.sh; here, stylistic
 * issues are warnings (CI does not pass --max-warnings 0) and only genuine
 * bugs are errors. React rules apply to the client (src/) only — the server
 * has functions like `useBackupCode` that are not React hooks.
 */
const sharedRules = {
  "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true }],
  "no-empty": ["warn", { allowEmptyCatch: true }],
  "no-console": ["warn", { allow: ["warn", "error", "info"] }],
  "no-restricted-imports": ["error", { patterns: ["*idbStorage*", "*/syncDb*", "*/syncChunked*"] }],
};

export default [
  {
    ignores: ["dist/**", "node_modules/**", "dev-dist/**", "public/**", "coverage/**"],
  },
  js.configs.recommended,

  // Client (browser + React).
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.serviceworker },
    },
    plugins: { "react-hooks": reactHooks, react },
    rules: {
      ...sharedRules,
      // Mark identifiers used only in JSX as used (kills false "unused" noise).
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },

  // Server + root configs (Node).
  {
    files: ["server/**/*.js", "*.config.js", "middleware.js", "api/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: sharedRules,
  },

  // Scripts, the migration runner and tests legitimately use the console.
  {
    files: ["scripts/**", "server/scripts/**", "**/__tests__/**", "**/*.test.js", "*.config.js"],
    languageOptions: { globals: { ...globals.node } },
    rules: { ...sharedRules, "no-console": "off" },
  },
];
