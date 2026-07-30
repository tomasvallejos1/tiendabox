import "express";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express requiere namespace para extender sus tipos; no hay alternativa con módulos ES2015.
  namespace Express {
    interface Request {
      user?: { id: string; role: string };
    }
  }
}
