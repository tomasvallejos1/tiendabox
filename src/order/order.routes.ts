import { Router, RequestHandler } from "express";
import { OrderController } from "./order.controller";

// Define los endpoints de Order y los asocia al controlador.
// Rutas de cliente: mis pedidos.
// Rutas de owner: listar todas, cambiar estado.
// Cualquier logueado: crear, ver por id y cancelar; el service decide segun el rol
// (el owner crea a nombre de un cliente y cancela cualquier pedido).
// guards es obligatorio a proposito: omitirlo es un error de compilacion, no una
// API abierta en silencio.
export function createOrderRoutes(
  controller: OrderController,
  guards: {
    auth: RequestHandler;
    ownerOnly: RequestHandler;
    clienteOnly: RequestHandler;
  },
): Router {
  const router = Router();

  router.post("/order", guards.auth, controller.create);
  router.get("/orders/mine", guards.auth, guards.clienteOnly, controller.getMyOrders);
  router.get("/orders", guards.auth, guards.ownerOnly, controller.getAll);
  router.get("/order/:id", guards.auth, controller.getById);
  router.put("/order/:id/status", guards.auth, guards.ownerOnly, controller.changeStatus);
  router.put("/order/:id/cancel", guards.auth, controller.cancel);

  return router;
}
