import { Request, Response } from "express";
import { ProductService } from "./product.service";
import { ValidationError } from "../errors";

// Recibe Request/Response, llama al service y devuelve codigos HTTP.
export class ProductController {
  constructor(private readonly service: ProductService) {}

  getAll = async (req: Request, res: Response): Promise<void> => {
    try {
      const filter: { category_id?: string; brand_id?: string } = {};
      if (typeof req.query.category_id === "string") {
        filter.category_id = req.query.category_id;
      }
      if (typeof req.query.brand_id === "string") {
        filter.brand_id = req.query.brand_id;
      }
      const products = await this.service.getAll(Object.keys(filter).length ? filter : undefined);
      res.status(200).json(products);
    } catch (error) {
      this.handleError(res, error);
    }
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    try {
      const product = await this.service.getById(req.params["id"] as string);
      if (!product) {
        res.status(404).json({ error: "Producto no encontrado" });
        return;
      }
      res.status(200).json(product);
    } catch (error) {
      this.handleError(res, error);
    }
  };

  create = async (req: Request, res: Response): Promise<void> => {
    try {
      const product = await this.service.create(req.body);
      res.status(201).json(product);
    } catch (error) {
      this.handleError(res, error);
    }
  };

  update = async (req: Request, res: Response): Promise<void> => {
    try {
      const product = await this.service.update(req.params["id"] as string, req.body);
      if (!product) {
        res.status(404).json({ error: "Producto no encontrado" });
        return;
      }
      res.status(200).json(product);
    } catch (error) {
      this.handleError(res, error);
    }
  };

  delete = async (req: Request, res: Response): Promise<void> => {
    try {
      const deleted = await this.service.delete(req.params["id"] as string);
      if (!deleted) {
        res.status(404).json({ error: "Producto no encontrado" });
        return;
      }
      res.status(204).send();
    } catch (error) {
      this.handleError(res, error);
    }
  };

  private handleError(res: Response, error: unknown): void {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
}
