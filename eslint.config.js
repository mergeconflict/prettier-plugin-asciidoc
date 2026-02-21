import js from "@eslint/js";
import tseslint from "typescript-eslint";
import love from "eslint-config-love";
import unicorn from "eslint-plugin-unicorn";

export default tseslint.config(
  // Global ignores.
  {
    ignores: ["node_modules/**", "dist/**"],
  },

  // Base JS recommended rules.
  js.configs.recommended,

  // Strict type-checked + stylistic type-checked TypeScript rules.
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // eslint-config-love: opinionated strict config.
  love,

  // eslint-plugin-unicorn: modern JS/TS conventions.
  unicorn.configs["recommended"],

  // TypeScript file settings.
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/strict-boolean-expressions": "error",
      "unicorn/no-null": "error",
      "no-console": "error",

      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },

  // Test files: relax magic numbers and null rules for test data.
  {
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-magic-numbers": "off",
      "unicorn/no-null": "off",
    },
  },

  // Plain JS config files: disable type-checked rules.
  {
    files: ["**/*.js"],
    ...tseslint.configs.disableTypeChecked,
  },
);
