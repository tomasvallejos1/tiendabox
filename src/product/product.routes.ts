import { Router, RequestHandler } from "express";
import { ProductController } from "./product.controller";

// Define los endpoints de Product y los asocia al controlador.
export function createProductRoutes(
  controller: ProductController,
  guards?: { auth: RequestHandler; ownerOnly: RequestHandler },
): Router {
  const router = Router();

  router.get("/products", controller.getAll);
  router.get("/product/:id", controller.getById);

  if (guards) {
    router.post("/product", guards.auth, guards.ownerOnly, controller.create);
    router.put("/product/:id", guards.auth, guards.ownerOnly, controller.update);
    router.delete("/product/:id", guards.auth, guards.ownerOnly, controller.delete);
  } else {
    router.post("/product", controller.create);
    router.put("/product/:id", controller.update);
    router.delete("/product/:id", controller.delete);
  }

  return router;
}
