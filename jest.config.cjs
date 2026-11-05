module.exports = {
  testEnvironment: "node",
  // Solo test/: evita levantar los .test.js compilados que puedan quedar en dist/.
  testMatch: ["<rootDir>/test/**/*.test.ts"],
  transform: { "^.+\\.tsx?$": "babel-jest" },
  clearMocks: true,
  verbose: true,
  // Los tests de integracion levantan contenedores de Postgres y Mongo, que tardan en arrancar.
  testTimeout: 60000,

  collectCoverageFrom: [
    "src/**/*.ts",
    // Solo arranca la app (conexiones y listen); se prueba levantando el servidor, no con tests.
    "!src/init.ts",
    // Constante de ~1700 lineas con la especificacion OpenAPI, sin logica que probar.
    "!src/docs/openapi.ts",
    // Solo declaran tipos: Babel los deja vacios y no hay nada que ejecutar.
    "!src/**/*.entity.ts",
    "!src/**/*.repository.interface.ts",
    // Scripts SQL, no codigo TypeScript.
    "!src/db/sql/**",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "html", "lcov", "json-summary"],
  // Si no se llega al minimo en cualquiera de las metricas, la corrida falla.
  // Piso de los tests unitarios (pre-push y CI corren solo test/unit), un poco por debajo
  // del valor real para no fallar por un par de lineas. La meta es 80%; subir este valor
  // a medida que se agreguen tests, para que el coverage no pueda bajar.
  coverageThreshold: {
    global: {
      statements: 45,
      branches: 45,
      functions: 45,
      lines: 45,
    },
  },
};
