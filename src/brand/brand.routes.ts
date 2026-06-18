import { Router } from "express";
import { BrandController } from "./brand.controller";

// Define los endpoints de Brand y los asocia al controlador.
export function createBrandRoutes(controller: BrandController): Router {
  const router = Router();

  router.get("/brands", controller.getAll);
  router.get("/brand/:id", controller.getById);
  router.post("/brand", controller.create);
  router.put("/brand/:id", controller.update);
  router.delete("/brand/:id", controller.delete);

  return router;
}
