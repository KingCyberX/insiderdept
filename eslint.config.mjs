import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Allow unused variables when they start with underscore
      "@typescript-eslint/no-unused-vars": [
        "warn", // Change to "error" if you want stricter enforcement
        {
          "argsIgnorePattern": "^_",
          "varsIgnorePattern": "^_",
          "caughtErrorsIgnorePattern": "^_",
          "ignoreRestSiblings": true
        }
      ],
      // Disable unused variables check for catch clause parameters specifically
      "no-unused-vars": ["warn", {
        "args": "none", // Don't check function arguments
        "caughtErrors": "none", // Don't check catch clause parameters
        "ignoreRestSiblings": true,
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_"
      }]
    }
  }
];

export default eslintConfig;