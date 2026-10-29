import { ValidationError } from "../errors";

export const PASSWORD_MIN_LENGTH = 6;

// Regla de contraseña compartida por el CRUD de usuarios y el cambio de contraseña.
// password obligatorio, string, minimo PASSWORD_MIN_LENGTH caracteres. Sin trim: los
// espacios son parte de la contraseña y se guarda exactamente lo que escribio el usuario.
export function validatePassword(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ValidationError("El campo 'password' es obligatorio");
  }
  if (value.length < PASSWORD_MIN_LENGTH) {
    throw new ValidationError(
      `El campo 'password' debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`,
    );
  }
  return value;
}
