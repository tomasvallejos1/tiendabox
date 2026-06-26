import { Request, Response } from "express";
import { UserService } from "./user.service";
import { ConflictError, ValidationError } from "../errors";

// Recibe Request/Response, llama al service y devuelve codigos HTTP.
export class UserController {
  constructor(private readonly service: UserService) {}

  getAll = async (_req: Request, res: Response): Promise<void> => {
    try {
      const users = await this.service.getAll();
      res.status(200).json(users);
    } catch (error) {
      this.handleError(res, error);
    }
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    try {
      const user = await this.service.getById(req.params["id"] as string);
      if (!user) {
        res.status(404).json({ error: "Usuario no encontrado" });
        return;
      }
      res.status(200).json(user);
    } catch (error) {
      this.handleError(res, error);
    }
  };

  create = async (req: Request, res: Response): Promise<void> => {
    try {
      const user = await this.service.create(req.body);
      res.status(201).json(user);
    } catch (error) {
      this.handleError(res, error);
    }
  };

  update = async (req: Request, res: Response): Promise<void> => {
    try {
      const user = await this.service.update(req.params["id"] as string, req.body);
      if (!user) {
        res.status(404).json({ error: "Usuario no encontrado" });
        return;
      }
      res.status(200).json(user);
    } catch (error) {
      this.handleError(res, error);
    }
  };

  delete = async (req: Request, res: Response): Promise<void> => {
    try {
      const deleted = await this.service.delete(req.params["id"] as string);
      if (!deleted) {
        res.status(404).json({ error: "Usuario no encontrado" });
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
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
}
