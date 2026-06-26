import { Router } from "express";
import { UserController } from "./user.controller";

// Define los endpoints de User y los asocia al controlador.
export function createUserRoutes(controller: UserController): Router {
  const router = Router();

  router.get("/users", controller.getAll);
  router.get("/user/:id", controller.getById);
  router.post("/user", controller.create);
  router.put("/user/:id", controller.update);
  router.delete("/user/:id", controller.delete);

  return router;
}
