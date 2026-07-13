import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { ConflictError, ValidationError } from "../errors";

export class AuthController {
  constructor(private readonly service: AuthService) {}

  register = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.service.register(req.body);
      res.status(201).json(result);
    } catch (error) {
      this.handleError(res, error);
    }
  };

  login = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.service.login(req.body);
      res.status(200).json(result);
    } catch (error) {
      this.handleError(res, error);
    }
  };

  logout = async (req: Request, res: Response): Promise<void> => {
    try {
      const raw = req.headers.authorization ?? "";
      const token = raw.startsWith("Bearer ") ? raw.slice(7) : raw;
      await this.service.logout(token);
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
    if (error instanceof ConflictError) {
      res.status(409).json({ error: error.message });
      return;
    }
    console.error(error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
}
