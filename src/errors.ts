// Error de validacion de negocio. El controller lo mapea a HTTP 400.
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}
