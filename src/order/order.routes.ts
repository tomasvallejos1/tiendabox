import { Router } from "express";
import { OrderController } from "./order.controller";

// Define los endpoints de Order y los asocia al controlador.
export function createOrderRoutes(controller: OrderController): Router {
  const router = Router();

  router.post("/order", controller.create);
  router.get("/orders/mine", controller.getMyOrders);
  router.get("/orders", controller.getAll);
  router.get("/order/:id", controller.getById);
  router.put("/order/:id/status", controller.changeStatus);
  router.put("/order/:id/cancel", controller.cancel);

  return router;
}
