import { Request, Response } from "express";
import { CartService } from "./cart.service";
import { ValidationError } from "../errors";

// Recibe Request/Response, llama al service y devuelve codigos HTTP.
export class CartController {
  constructor(private readonly service: CartService) {}

  getCart = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const cart = await this.service.getCart(userId);
      res.status(200).json(cart);
    } catch (error) {
      this.handleError(res, error);
    }
  };

  addItem = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { product_id, quantity } = req.body;
      const cart = await this.service.addItem(userId, product_id, quantity);
      res.status(200).json(cart);
    } catch (error) {
      this.handleError(res, error);
    }
  };

  removeItem = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const productId = req.params["productId"] as string;
      const cart = await this.service.removeItem(userId, productId);
      res.status(200).json(cart);
    } catch (error) {
      this.handleError(res, error);
    }
  };

  clear = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      await this.service.clear(userId);
      res.status(204).send();
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
