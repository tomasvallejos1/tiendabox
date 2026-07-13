import { Router, RequestHandler } from "express";
import { BrandController } from "./brand.controller";

// Define los endpoints de Brand y los asocia al controlador.
export function createBrandRoutes(
  controller: BrandController,
  guards?: { auth: RequestHandler; ownerOnly: RequestHandler },
): Router {
  const router = Router();

  router.get("/brands", controller.getAll);
  router.get("/brand/:id", controller.getById);

  if (guards) {
    router.post("/brand", guards.auth, guards.ownerOnly, controller.create);
    router.put("/brand/:id", guards.auth, guards.ownerOnly, controller.update);
    router.delete("/brand/:id", guards.auth, guards.ownerOnly, controller.delete);
  } else {
    router.post("/brand", controller.create);
    router.put("/brand/:id", controller.update);
    router.delete("/brand/:id", controller.delete);
  }

  return router;
}
