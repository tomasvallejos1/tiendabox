import { defineConfig } from "vitest/config";

// Los tests viven junto al codigo que prueban, en src/. Acotar el include a
// src/ evita que Vitest tambien levante los .test.js compilados en dist/, que
// al ser CommonJS no puede importar y hacen fallar la corrida despues de un build.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
