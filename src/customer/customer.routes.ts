import { Router } from "express";
import { CustomerController } from "./customer.controller";

// Define los endpoints de Customer y los asocia al controlador.
export function createCustomerRoutes(controller: CustomerController): Router {
  const router = Router();

  router.get("/customers", controller.getAll);
  router.get("/customer/:id", controller.getById);
  router.post("/customer", controller.create);
  router.put("/customer/:id", controller.update);
  router.delete("/customer/:id", controller.delete);

  return router;
}
