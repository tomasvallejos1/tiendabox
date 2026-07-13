import { Router, RequestHandler } from "express";
import { CartController } from "./cart.controller";

// Define los endpoints del Cart y los asocia al controlador.
// Todas las rutas requieren auth + cliente.
export function createCartRoutes(
  controller: CartController,
  guards?: { auth: RequestHandler; clienteOnly: RequestHandler },
): Router {
  const router = Router();

  if (guards) {
    router.get("/cart", guards.auth, guards.clienteOnly, controller.getCart);
    router.post("/cart/items", guards.auth, guards.clienteOnly, controller.addItem);
    router.delete("/cart/items/:productId", guards.auth, guards.clienteOnly, controller.removeItem);
    router.delete("/cart", guards.auth, guards.clienteOnly, controller.clear);
  } else {
    router.get("/cart", controller.getCart);
    router.post("/cart/items", controller.addItem);
    router.delete("/cart/items/:productId", controller.removeItem);
    router.delete("/cart", controller.clear);
  }

  return router;
}
