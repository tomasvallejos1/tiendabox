import { Request, Response, NextFunction, RequestHandler } from "express";

// Middleware de autorización por rol. Verifica que req.user exista y que su rol
// esté en la lista de roles permitidos.
export function authorize(...roles: string[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "No autenticado" });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "No autorizado" });
      return;
    }

    next();
  };
}
