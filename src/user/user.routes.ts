import { Router, RequestHandler } from "express";
import { UserController } from "./user.controller";

// Define los endpoints de User y los asocia al controlador.
// Todas las rutas requieren auth + owner: la gestion de usuarios es de backoffice.
// El alta publica de clientes va por /api/auth/register.
// guards es obligatorio a proposito: omitirlo es un error de compilacion, no una
// API abierta en silencio.
export function createUserRoutes(
  controller: UserController,
  guards: { auth: RequestHandler; ownerOnly: RequestHandler },
): Router {
  const router = Router();

  router.get("/users", guards.auth, guards.ownerOnly, controller.getAll);
  router.get("/user/:id", guards.auth, guards.ownerOnly, controller.getById);
  router.post("/user", guards.auth, guards.ownerOnly, controller.create);
  router.put("/user/:id", guards.auth, guards.ownerOnly, controller.update);
  router.delete("/user/:id", guards.auth, guards.ownerOnly, controller.delete);

  return router;
}
