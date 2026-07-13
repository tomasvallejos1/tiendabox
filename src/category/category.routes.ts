import { Router, RequestHandler } from "express";
import { CategoryController } from "./category.controller";

// Define los endpoints de Category y los asocia al controlador.
export function createCategoryRoutes(
  controller: CategoryController,
  guards?: { auth: RequestHandler; ownerOnly: RequestHandler },
): Router {
  const router = Router();

  router.get("/categories", controller.getAll);
  router.get("/category/:id", controller.getById);

  if (guards) {
    router.post("/category", guards.auth, guards.ownerOnly, controller.create);
    router.put("/category/:id", guards.auth, guards.ownerOnly, controller.update);
    router.delete("/category/:id", guards.auth, guards.ownerOnly, controller.delete);
  } else {
    router.post("/category", controller.create);
    router.put("/category/:id", controller.update);
    router.delete("/category/:id", controller.delete);
  }

  return router;
}
