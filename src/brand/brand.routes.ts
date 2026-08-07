import { Router, RequestHandler } from "express";
import { BrandController } from "./brand.controller";

// Define los endpoints de Brand y los asocia al controlador.
// guards es obligatorio a proposito: omitirlo es un error de compilacion, no una
// API abierta en silencio.
export function createBrandRoutes(
  controller: BrandController,
  guards: { auth: RequestHandler; ownerOnly: RequestHandler },
): Router {
  const router = Router();

  router.get("/brands", controller.getAll);
  router.get("/brand/:id", controller.getById);

  router.post("/brand", guards.auth, guards.ownerOnly, controller.create);
  router.put("/brand/:id", guards.auth, guards.ownerOnly, controller.update);
  router.delete("/brand/:id", guards.auth, guards.ownerOnly, controller.delete);

  return router;
}
