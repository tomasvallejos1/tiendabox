// Error de validacion de negocio. El controller lo mapea a HTTP 400.
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

// Error de conflicto (recurso duplicado). El controller lo mapea a HTTP 409.
export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}
