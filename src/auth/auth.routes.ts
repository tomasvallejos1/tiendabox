import { Router } from "express";
import { AuthController } from "./auth.controller";

// Define los endpoints de Auth y los asocia al controlador.
export function createAuthRoutes(controller: AuthController): Router {
  const router = Router();

  router.post("/auth/register", controller.register);
  router.post("/auth/login", controller.login);

  return router;
}
