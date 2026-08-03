import { Request, Response } from "express";
import { CustomerService } from "./customer.service";
import { ConflictError, ForbiddenError, ValidationError } from "../errors";

// Recibe Request/Response, llama al service y devuelve codigos HTTP.
export class CustomerController {
  constructor(private readonly service: CustomerService) {}

  getAll = async (_req: Request, res: Response): Promise<void> => {
    try {
      const customers = await this.service.getAll();
      res.status(200).json(customers);
    } catch (error) {
      this.handleError(res, error);
    }
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params["id"] as string;
      const userId = req.user!.id;
      const role = req.user!.role;

      const customer = await this.service.getById(id, userId, role);
      if (!customer) {
        res.status(404).json({ error: "Cliente no encontrado" });
        return;
      }
      res.status(200).json(customer);
    } catch (error) {
      this.handleError(res, error);
    }
  };

  create = async (req: Request, res: Response): Promise<void> => {
    try {
      const customer = await this.service.create(req.body);
      res.status(201).json(customer);
    } catch (error) {
      this.handleError(res, error);
    }
  };

  update = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params["id"] as string;
      const userId = req.user!.id;
      const role = req.user!.role;

      const customer = await this.service.update(id, req.body, userId, role);
      if (!customer) {
        res.status(404).json({ error: "Cliente no encontrado" });
        return;
      }
      res.status(200).json(customer);
    } catch (error) {
      this.handleError(res, error);
    }
  };

  delete = async (req: Request, res: Response): Promise<void> => {
    try {
      const deleted = await this.service.delete(req.params["id"] as string);
      if (!deleted) {
        res.status(404).json({ error: "Cliente no encontrado" });
        return;
      }
      res.status(204).send();
    } catch (error) {
      this.handleError(res, error);
    }
  };

  // Mapea errores a codigos HTTP: 400 validacion, 409 conflicto, 500 inesperado.
  private handleError(res: Response, error: unknown): void {
    if (error instanceof ValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof ConflictError) {
      res.status(409).json({ error: error.message });
      return;
    }
    if (error instanceof ForbiddenError) {
      res.status(403).json({ error: error.message });
      return;
    }
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
}
