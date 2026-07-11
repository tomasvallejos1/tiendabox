import { Router } from "express";
import { CartController } from "./cart.controller";

// Define los endpoints del Cart y los asocia al controlador.
export function createCartRoutes(controller: CartController): Router {
  const router = Router();

  router.get("/cart", controller.getCart);
  router.post("/cart/items", controller.addItem);
  router.delete("/cart/items/:productId", controller.removeItem);
  router.delete("/cart", controller.clear);

  return router;
}
