import { Customer } from "./customer.entity";
import { ICustomerRepository } from "./customer.repository.interface";
import { ValidationError } from "../errors";

// Valores validos para tax_status.
const VALID_TAX_STATUSES = [
  "consumidor_final",
  "responsable_inscripto",
  "monotributo",
  "exento",
] as const;
const DEFAULT_TAX_STATUS = "consumidor_final";

// Reglas de negocio de Customer. Delega la persistencia en el repositorio.
export class CustomerService {
  constructor(private readonly repository: ICustomerRepository) {}

  async getAll(): Promise<Customer[]> {
    return this.repository.getAll();
  }

  async getById(id: string): Promise<Customer | null> {
    return this.repository.getById(id);
  }

  async create(input: {
    user_id?: unknown;
    name?: unknown;
    government_id?: unknown;
    tax_status?: unknown;
    phone?: unknown;
    address?: unknown;
  }): Promise<Customer> {
    const user_id = this.validateUserId(input.user_id);
    const name = this.validateName(input.name);
    const government_id = this.validateGovernmentId(input.government_id);
    const tax_status = this.validateTaxStatus(input.tax_status);
    const phone = this.normalizeOptionalString(input.phone);
    const address = this.normalizeOptionalString(input.address);

    return this.repository.create({ user_id, name, government_id, tax_status, phone, address });
  }

  async update(
    id: string,
    input: {
      name?: unknown;
      government_id?: unknown;
      tax_status?: unknown;
      phone?: unknown;
      address?: unknown;
    },
  ): Promise<Customer | null> {
    const data: Partial<Omit<Customer, "id" | "user_id" | "created_at">> = {};

    if (input.name !== undefined) {
      data.name = this.validateName(input.name);
    }
    if (input.government_id !== undefined) {
      data.government_id = this.validateGovernmentId(input.government_id);
    }
    if (input.tax_status !== undefined) {
      data.tax_status = this.validateTaxStatus(input.tax_status);
    }
    if (input.phone !== undefined) {
      data.phone = this.normalizeOptionalString(input.phone);
    }
    if (input.address !== undefined) {
      data.address = this.normalizeOptionalString(input.address);
    }

    if (Object.keys(data).length === 0) {
      throw new ValidationError("El body no puede estar vacío");
    }

    return this.repository.update(id, data);
  }

  async delete(id: string): Promise<boolean> {
    return this.repository.delete(id);
  }

  // user_id obligatorio, string no vacio.
  private validateUserId(value: unknown): string {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new ValidationError("El campo 'user_id' es obligatorio");
    }
    return value.trim();
  }

  // name obligatorio, string y no vacio.
  private validateName(value: unknown): string {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new ValidationError("El campo 'name' es obligatorio");
    }
    return value.trim();
  }

  // government_id: opcional; si viene, 11 digitos numericos (CUIT/CUIL). Vacio se trata como null.
  private validateGovernmentId(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== "string") {
      throw new ValidationError("El campo 'government_id' debe ser un string");
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    if (!/^\d{11}$/.test(trimmed)) {
      throw new ValidationError(
        "El campo 'government_id' debe contener 11 dígitos numéricos (CUIT/CUIL)",
      );
    }
    return trimmed;
  }

  // tax_status: si viene, debe ser uno de los valores validos. Si no, default consumidor_final.
  private validateTaxStatus(value: unknown): string {
    if (value === undefined || value === null) return DEFAULT_TAX_STATUS;
    if (typeof value !== "string") {
      throw new ValidationError("El campo 'tax_status' debe ser un string");
    }
    const trimmed = value.trim();
    if (!(VALID_TAX_STATUSES as readonly string[]).includes(trimmed)) {
      throw new ValidationError(
        `El campo 'tax_status' debe ser uno de: ${VALID_TAX_STATUSES.join(", ")}`,
      );
    }
    return trimmed;
  }

  // Campos opcionales string: si es string vacio lo trata como null.
  private normalizeOptionalString(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== "string") {
      throw new ValidationError("El campo debe ser un string");
    }
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }
}
