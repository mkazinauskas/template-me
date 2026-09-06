import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // A leading underscore marks a binding that exists only to be discarded —
      // in practice the `const { secret: _secret, ...safe } = row` idiom used to
      // strip fields from an object (see src/lib/template-access.ts).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { varsIgnorePattern: "^_", argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Environment variables have exactly one entry point: src/lib/env.ts,
    // which declares, validates and types every var the app reads (see the
    // header comment there). Reading `process.env` anywhere else in src/
    // would reintroduce an unvalidated, undocumented var.
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/lib/env.ts",
      // Tests set up their own environment before importing the module under test.
      "src/**/*.test.{ts,tsx}",
      "src/**/*.test-helpers.ts",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message:
            "Import `env` (server) or `clientEnv` (browser) from @/lib/env instead of reading process.env directly; add the variable to the schema there.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
  ]),
]);

export default eslintConfig;
