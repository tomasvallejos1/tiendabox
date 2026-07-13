import { Router, RequestHandler } from "express";
import { CustomerController } from "./customer.controller";

// Define los endpoints de Customer y los asocia al controlador.
// GET /customers: solo owner. GET /customer/:id: cualquier logueado.
// PUT /customer/:id: cualquier logueado (el service valida pertenencia).
// POST y DELETE: sin guards (POST se usa en register, DELETE solo owner).
export function createCustomerRoutes(
  controller: CustomerController,
  guards?: { auth: RequestHandler; ownerOnly: RequestHandler },
): Router {
  const router = Router();

  if (guards) {
    router.get("/customers", guards.auth, guards.ownerOnly, controller.getAll);
    router.get("/customer/:id", guards.auth, controller.getById);
    router.post("/customer", controller.create);
    router.put("/customer/:id", guards.auth, controller.update);
    router.delete("/customer/:id", guards.auth, guards.ownerOnly, controller.delete);
  } else {
    router.get("/customers", controller.getAll);
    router.get("/customer/:id", controller.getById);
    router.post("/customer", controller.create);
    router.put("/customer/:id", controller.update);
    router.delete("/customer/:id", controller.delete);
  }

  return router;
}
