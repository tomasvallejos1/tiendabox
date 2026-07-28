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

// Error de acceso prohibido (recurso ajeno). El controller lo mapea a HTTP 403.
export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}
