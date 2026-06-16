import { App } from "./app";

// Punto de entrada: crea la aplicacion y la arranca.
const application = new App();
application.start().catch((error) => {
  console.error("No se pudo iniciar TiendaBox:", error);
  process.exit(1);
});
