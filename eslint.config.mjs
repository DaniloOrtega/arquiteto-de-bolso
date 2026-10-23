// Verificador de estilo e de erros comuns (lint).
// Lê o JavaScript dentro do index.html, o service worker e os testes.
import js from "@eslint/js";
import html from "eslint-plugin-html";
import globals from "globals";

export default [
  { ignores: ["node_modules/", "dist/"] },
  js.configs.recommended,
  {
    rules: {
      // O jogo usa try/catch vazio de propósito (som, voz e armazenamento são opcionais).
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-unused-vars": ["error", { caughtErrors: "none" }],
    },
  },
  {
    files: ["**/*.html"],
    plugins: { html },
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "script",
      globals: { ...globals.browser, firebase: "readonly" },
    },
  },
  {
    files: ["sw.js"],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: { sourceType: "commonjs", globals: globals.node },
  },
];
