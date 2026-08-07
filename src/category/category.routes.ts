import { Router, RequestHandler } from "express";
import { CategoryController } from "./category.controller";

// Define los endpoints de Category y los asocia al controlador.
// guards es obligatorio a proposito: omitirlo es un error de compilacion, no una
// API abierta en silencio.
export function createCategoryRoutes(
  controller: CategoryController,
  guards: { auth: RequestHandler; ownerOnly: RequestHandler },
): Router {
  const router = Router();

  router.get("/categories", controller.getAll);
  router.get("/category/:id", controller.getById);

  router.post("/category", guards.auth, guards.ownerOnly, controller.create);
  router.put("/category/:id", guards.auth, guards.ownerOnly, controller.update);
  router.delete("/category/:id", guards.auth, guards.ownerOnly, controller.delete);

  return router;
}
