import { Customer } from "./customer.entity";
import { ICustomerRepository } from "./customer.repository.interface";
import { ConflictError, ValidationError } from "../errors";

// Rol asignado por defecto a todo cliente creado.
const DEFAULT_ROLE = "cliente";

// Reglas de negocio de Customer. Delega la persistencia en el repositorio.
export class CustomerService {
  constructor(private readonly repository: ICustomerRepository) {}

  async getAll(): Promise<Customer[]> {
    return this.repository.getAll();
  }

  async getById(id: string): Promise<Customer | null> {
    return this.repository.getById(id);
  }

  async create(input: { name?: unknown; email?: unknown }): Promise<Customer> {
    const name = this.validateName(input.name);
    const email = this.validateEmail(input.email);
    await this.ensureEmailIsUnique(email);
    // El rol se fuerza por reglas de negocio, no se acepta desde el body.
    return this.repository.create({ name, email, role: DEFAULT_ROLE });
  }

  async update(id: string, input: { name?: unknown; email?: unknown }): Promise<Customer | null> {
    const data: Partial<Omit<Customer, "id">> = {};

    if (input.name !== undefined) {
      data.name = this.validateName(input.name);
    }
    if (input.email !== undefined) {
      data.email = this.validateEmail(input.email);
    }

    // El campo role se ignora silenciosamente: no se puede modificar desde el body.
    if (Object.keys(data).length === 0) {
      throw new ValidationError("El body no puede estar vacío");
    }

    if (data.email !== undefined) {
      await this.ensureEmailIsUnique(data.email, id);
    }

    return this.repository.update(id, data);
  }

  async delete(id: string): Promise<boolean> {
    return this.repository.delete(id);
  }

  // Rechaza emails ya usados por otro cliente (case-insensitive).
  // excludeId permite que un cliente conserve su propio email al actualizar.
  private async ensureEmailIsUnique(email: string, excludeId?: string): Promise<void> {
    const existing = await this.repository.getByEmail(email);
    if (existing && existing.id !== excludeId) {
      throw new ConflictError(`Ya existe un cliente con el email '${email}'`);
    }
  }

  // name obligatorio, string y no vacio
  private validateName(value: unknown): string {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new ValidationError("El campo 'name' es obligatorio");
    }
    return value.trim();
  }

  // email obligatorio, string y con formato basico (contiene '@')
  private validateEmail(value: unknown): string {
    if (typeof value !== "string" || !value.includes("@")) {
      throw new ValidationError("El campo 'email' debe ser un email válido");
    }
    return value.trim();
  }
}
