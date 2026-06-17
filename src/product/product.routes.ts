import { Router } from "express";
import { ProductController } from "./product.controller";

// Define los endpoints de Product y los asocia al controlador.
export function createProductRoutes(controller: ProductController): Router {
  const router = Router();

  router.get("/products", controller.getAll);
  router.get("/product/:id", controller.getById);
  router.post("/product", controller.create);
  router.put("/product/:id", controller.update);
  router.delete("/product/:id", controller.delete);

  return router;
}
