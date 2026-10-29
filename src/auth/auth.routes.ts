import { Router, RequestHandler } from "express";
import { AuthController } from "./auth.controller";

// Define los endpoints de Auth y los asocia al controlador.
// register, login y logout son publicos; el cambio de contraseña requiere auth, para
// cualquier rol.
// guards es obligatorio a proposito: omitirlo es un error de compilacion, no una
// API abierta en silencio.
export function createAuthRoutes(
  controller: AuthController,
  guards: { auth: RequestHandler },
): Router {
  const router = Router();

  router.post("/auth/register", controller.register);
  router.post("/auth/login", controller.login);
  router.post("/auth/logout", controller.logout);
  router.put("/auth/password", guards.auth, controller.changePassword);

  return router;
}
