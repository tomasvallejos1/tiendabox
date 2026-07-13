import { Request, Response, NextFunction, RequestHandler } from "express";
import { ISessionRepository } from "../session/session.repository.interface";
import { IUserRepository } from "../user/user.repository.interface";

// Factory que crea el middleware de autenticación por token de sesión.
export function authenticate(
  sessionRepo: ISessionRepository,
  userRepo: IUserRepository,
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const raw = req.headers.authorization ?? "";
    const token = raw.startsWith("Bearer ") ? raw.slice(7) : raw;

    if (!token) {
      res.status(401).json({ error: "No autenticado" });
      return;
    }

    const session = await sessionRepo.getByToken(token);
    if (!session) {
      res.status(401).json({ error: "No autenticado" });
      return;
    }

    if (new Date(session.expires_at) <= new Date()) {
      res.status(401).json({ error: "Sesión expirada" });
      return;
    }

    const user = await userRepo.getById(session.user_id);
    if (!user) {
      res.status(401).json({ error: "No autenticado" });
      return;
    }

    req.user = { id: user.id, role: user.role };
    next();
  };
}
