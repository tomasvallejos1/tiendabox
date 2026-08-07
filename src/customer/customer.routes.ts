import { Router, RequestHandler } from "express";
import { CustomerController } from "./customer.controller";

// Define los endpoints de Customer y los asocia al controlador.
// GET /customers: solo owner. GET /customer/:id: cualquier logueado.
// PUT /customer/:id: cualquier logueado (el service valida pertenencia).
// POST /customer: solo owner (el registro de clientes va por /api/auth/register).
// DELETE /customer/:id: solo owner.
// guards es obligatorio a proposito: omitirlo es un error de compilacion, no una
// API abierta en silencio.
export function createCustomerRoutes(
  controller: CustomerController,
  guards: { auth: RequestHandler; ownerOnly: RequestHandler },
): Router {
  const router = Router();

  router.get("/customers", guards.auth, guards.ownerOnly, controller.getAll);
  router.get("/customer/:id", guards.auth, controller.getById);
  router.post("/customer", guards.auth, guards.ownerOnly, controller.create);
  router.put("/customer/:id", guards.auth, controller.update);
  router.delete("/customer/:id", guards.auth, guards.ownerOnly, controller.delete);

  return router;
}
