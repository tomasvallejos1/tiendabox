import { Request, Response, NextFunction } from "express";
import { ValidationError, ConflictError, ForbiddenError } from "../errors";

// Red de seguridad global de la aplicacion.
// Los controllers siguen mapeando sus propios errores con handleError; estos dos
// middlewares cubren lo que hoy no captura nadie: rutas inexistentes y errores
// async que escapan de los try/catch (Express 5 los deriva aca automaticamente).

// Responde 404 en JSON para cualquier ruta que no haya matcheado antes.
// Sin esto, Express devuelve su pagina HTML por defecto en una API JSON.
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
}

// Mapea los errores de negocio a codigos HTTP. Tiene que declarar los cuatro
// parametros aunque no use next: Express identifica los manejadores de error por
// su aridad, con tres se registraria como middleware comun.
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- requerido por la aridad
  _next: NextFunction,
): void {
  if (isJsonParseError(err)) {
    res.status(400).json({ error: "El cuerpo de la petición no es un JSON válido" });
    return;
  }
  if (err instanceof ValidationError) {
    res.status(400).json({ error: err.message });
    return;
  }
  if (err instanceof ConflictError) {
    res.status(409).json({ error: err.message });
    return;
  }
  if (err instanceof ForbiddenError) {
    res.status(403).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor" });
}

// express.json() (body-parser) rechaza un body mal formado antes de llegar a las rutas, asi
// que ningun controller lo ve: el error llega directo aca. Es un SyntaxError con
// type "entity.parse.failed" y status 400. Es un error del cliente, no del servidor:
// sin este caso terminaba como 500.
function isJsonParseError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const { type, status } = err as { type?: unknown; status?: unknown };
  return type === "entity.parse.failed" || (err instanceof SyntaxError && status === 400);
}
