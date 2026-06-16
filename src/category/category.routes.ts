import { Router } from "express";
import { CategoryController } from "./category.controller";

// Define los endpoints de Category y los asocia al controlador.
export function createCategoryRoutes(controller: CategoryController): Router {
  const router = Router();

  router.get("/categories", controller.getAll);
  router.get("/category/:id", controller.getById);
  router.post("/category", controller.create);
  router.put("/category/:id", controller.update);
  router.delete("/category/:id", controller.delete);

  return router;
}
