import { ValidationError } from "./errors";

// Valida un id que llega del cliente antes de usarlo en una consulta.
// Tiene que ser un string no vacio: si llegara un objeto como { "$ne": null }, Mongo lo
// interpretaria como operador en findOne({ _id: id }) y matchearia cualquier documento.
// Devuelve el id sin espacios sobrantes.
export function requireId(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`El campo '${field}' es obligatorio`);
  }
  return value.trim();
}
