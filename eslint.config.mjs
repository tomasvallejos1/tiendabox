import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import prettierConfig from "eslint-config-prettier";

// Configuracion plana (flat config) de ESLint para TypeScript.
// Las reglas de formato se delegan a Prettier (eslint-config-prettier las desactiva).
export default [
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  js.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // TypeScript ya valida los simbolos no definidos; no-undef da falsos positivos
      // con los globals de Node (console, process), por eso se desactiva.
      "no-undef": "off",
      // console.error se usa para reportar errores inesperados en los controllers.
      "no-console": "off",
    },
  },
  // Debe ir al final: desactiva las reglas que chocan con Prettier.
  prettierConfig,
];
