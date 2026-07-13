import { Router, RequestHandler } from "express";
import { OrderController } from "./order.controller";

// Define los endpoints de Order y los asocia al controlador.
// Rutas de cliente: crear, mis pedidos, cancelar.
// Rutas de owner: listar todas, cambiar estado.
// GET /order/:id: cualquier logueado.
export function createOrderRoutes(
  controller: OrderController,
  guards?: {
    auth: RequestHandler;
    ownerOnly: RequestHandler;
    clienteOnly: RequestHandler;
  },
): Router {
  const router = Router();

  if (guards) {
    router.post("/order", guards.auth, guards.clienteOnly, controller.create);
    router.get("/orders/mine", guards.auth, guards.clienteOnly, controller.getMyOrders);
    router.get("/orders", guards.auth, guards.ownerOnly, controller.getAll);
    router.get("/order/:id", guards.auth, controller.getById);
    router.put("/order/:id/status", guards.auth, guards.ownerOnly, controller.changeStatus);
    router.put("/order/:id/cancel", guards.auth, guards.clienteOnly, controller.cancel);
  } else {
    router.post("/order", controller.create);
    router.get("/orders/mine", controller.getMyOrders);
    router.get("/orders", controller.getAll);
    router.get("/order/:id", controller.getById);
    router.put("/order/:id/status", controller.changeStatus);
    router.put("/order/:id/cancel", controller.cancel);
  }

  return router;
}
