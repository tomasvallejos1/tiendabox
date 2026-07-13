import { Request, Response } from "express";
import { OrderService } from "./order.service";
import { ValidationError } from "../errors";

// Recibe Request/Response, llama al service y devuelve codigos HTTP.
export class OrderController {
  constructor(private readonly service: OrderService) {}

  create = async (req: Request, res: Response): Promise<void> => {
    try {
      // TODO: reemplazar por req.user en commit 8
      const customerId = req.body.customer_id as string;
      if (!customerId) {
        res.status(400).json({ error: "customer_id es obligatorio" });
        return;
      }

      const order = await this.service.createOrder(customerId, req.body);
      res.status(201).json(order);
    } catch (error) {
      this.handleError(res, error);
    }
  };

  getMyOrders = async (req: Request, res: Response): Promise<void> => {
    try {
      // TODO: reemplazar por req.user en commit 8
      const customerId = req.body.customer_id as string;
      if (!customerId) {
        res.status(400).json({ error: "customer_id es obligatorio" });
        return;
      }

      const orders = await this.service.getMyOrders(customerId);
      res.status(200).json(orders);
    } catch (error) {
      this.handleError(res, error);
    }
  };

  getAll = async (req: Request, res: Response): Promise<void> => {
    try {
      const statusFilter = req.query["status"] as string | undefined;
      const orders = await this.service.getAllOrders(statusFilter);
      res.status(200).json(orders);
    } catch (error) {
      this.handleError(res, error);
    }
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    try {
      const order = await this.service.getById(req.params["id"] as string);
      if (!order) {
        res.status(404).json({ error: "Pedido no encontrado" });
        return;
      }
      res.status(200).json(order);
    } catch (error) {
      this.handleError(res, error);
    }
  };

  changeStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params["id"] as string;
      const { status } = req.body;

      const order = await this.service.changeStatus(id, status);
      if (!order) {
        res.status(404).json({ error: "Pedido no encontrado" });
        return;
      }
      res.status(200).json(order);
    } catch (error) {
      this.handleError(res, error);
    }
  };

  cancel = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params["id"] as string;
      // TODO: reemplazar por req.user en commit 8
      const customerId = req.body.customer_id as string;
      if (!customerId) {
        res.status(400).json({ error: "customer_id es obligatorio" });
        return;
      }

      const order = await this.service.cancelOrder(id, customerId);
      if (!order) {
        res.status(404).json({ error: "Pedido no encontrado" });
        return;
      }
      res.status(200).json(order);
    } catch (error) {
      this.handleError(res, error);
    }
  };

  // Mapea errores a codigos HTTP: 400 validacion, 500 inesperado.
  private handleError(res: Response, error: unknown): void {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
}
