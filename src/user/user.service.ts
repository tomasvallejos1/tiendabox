import { User } from "./user.entity";
import { IUserRepository } from "./user.repository.interface";
import { ConflictError, ValidationError } from "../errors";

const PASSWORD_MIN_LENGTH = 6;
const VALID_ROLES = ["cliente", "owner"];

// Reglas de negocio de User. Delega la persistencia en el repositorio.
export class UserService {
  constructor(private readonly repository: IUserRepository) {}

  async getAll(): Promise<User[]> {
    return this.repository.getAll();
  }

  async getById(id: string): Promise<User | null> {
    return this.repository.getById(id);
  }

  async create(input: { email?: unknown; password?: unknown; role?: unknown }): Promise<User> {
    const email = this.validateEmail(input.email);
    const password = this.validatePassword(input.password);
    const role = this.normalizeRole(input.role);
    await this.ensureEmailIsUnique(email);
    return this.repository.create({ email, password, role });
  }

  async update(
    id: string,
    input: { email?: unknown; password?: unknown; role?: unknown },
  ): Promise<User | null> {
    const data: Partial<Omit<User, "id" | "created_at">> = {};

    if (input.email !== undefined) {
      data.email = this.validateEmail(input.email);
    }
    if (input.password !== undefined) {
      data.password = this.validatePassword(input.password);
    }
    if (input.role !== undefined) {
      data.role = this.validateRole(input.role);
    }

    if (Object.keys(data).length === 0) {
      throw new ValidationError("El body no puede estar vacio");
    }

    if (data.email !== undefined) {
      await this.ensureEmailIsUnique(data.email, id);
    }

    return this.repository.update(id, data);
  }

  async delete(id: string): Promise<boolean> {
    return this.repository.delete(id);
  }

  // Rechaza emails ya usados por otro usuario (case-insensitive).
  // excludeId permite que un usuario conserve su propio email al actualizar.
  private async ensureEmailIsUnique(email: string, excludeId?: string): Promise<void> {
    const existing = await this.repository.getByEmail(email);
    if (existing && existing.id !== excludeId) {
      throw new ConflictError("Ya existe un usuario con ese email");
    }
  }

  // email obligatorio, string, debe contener "@"
  private validateEmail(value: unknown): string {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new ValidationError("El campo 'email' es obligatorio");
    }
    const email = value.trim();
    if (!email.includes("@")) {
      throw new ValidationError("El campo 'email' debe ser un email valido");
    }
    return email;
  }

  // password obligatorio, string, minimo 6 caracteres
  private validatePassword(value: unknown): string {
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

  // role obligatorio en este contexto: "cliente" o "owner"
  private validateRole(value: unknown): string {
    if (typeof value !== "string" || !VALID_ROLES.includes(value)) {
      throw new ValidationError("El campo 'role' debe ser 'cliente' o 'owner'");
    }
    return value;
  }

  // role opcional en create: default "cliente"
  private normalizeRole(value: unknown): string {
    if (value === undefined || value === null) {
      return "cliente";
    }
    return this.validateRole(value);
  }
}
