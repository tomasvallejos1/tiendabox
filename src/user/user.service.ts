import { PublicUser, User } from "./user.entity";
import { IUserRepository } from "./user.repository.interface";
import type { ICustomerRepository } from "../customer/customer.repository.interface";
import type { RunInTransaction } from "../db/run-in-transaction";
import { ConflictError, ValidationError } from "../errors";
import { validatePassword } from "./password";

const VALID_ROLES = ["cliente", "owner"];

// Reglas de negocio de User. Delega la persistencia en el repositorio.
// Un usuario con perfil de cliente se administra desde Clientes: aca no se borra ni se le
// cambia el rol, porque quedaria un owner con carrito y perfil, o un perfil sin cuenta.
export class UserService {
  constructor(
    private readonly repository: IUserRepository,
    private readonly customerRepository: ICustomerRepository,
    private readonly runInTransaction: RunInTransaction,
  ) {}

  async getAll(): Promise<PublicUser[]> {
    const users = await this.repository.getAll();
    return users.map((user) => this.toPublic(user));
  }

  async getById(id: string): Promise<PublicUser | null> {
    const user = await this.repository.getById(id);
    return user ? this.toPublic(user) : null;
  }

  async create(input: {
    email?: unknown;
    password?: unknown;
    role?: unknown;
  }): Promise<PublicUser> {
    const email = this.validateEmail(input.email);
    const password = validatePassword(input.password);
    const role = this.normalizeRole(input.role);
    await this.ensureEmailIsUnique(email);
    const user = await this.repository.create({ email, password, role });
    return this.toPublic(user);
  }

  // requesterId es el usuario autenticado que hace la peticion.
  async update(
    id: string,
    input: { email?: unknown; password?: unknown; role?: unknown },
    requesterId: string,
  ): Promise<PublicUser | null> {
    const data: Partial<Omit<User, "id" | "created_at">> = {};

    if (input.email !== undefined) {
      data.email = this.validateEmail(input.email);
    }
    if (input.password !== undefined) {
      data.password = validatePassword(input.password);
    }
    if (input.role !== undefined) {
      data.role = this.validateRole(input.role);
    }

    if (Object.keys(data).length === 0) {
      throw new ValidationError("El body no puede estar vacio");
    }

    if (data.role !== undefined) {
      const existing = await this.repository.getById(id);
      if (!existing) return null;
      await this.ensureRoleCanChange(existing, data.role, requesterId);
    }

    if (data.email !== undefined) {
      await this.ensureEmailIsUnique(data.email, id);
    }

    const user = await this.repository.update(id, data);
    return user ? this.toPublic(user) : null;
  }

  // requesterId es el usuario autenticado que hace la peticion. Devuelve false si el
  // usuario no existe. Sesiones y usuario se borran en una transaccion: sessions.user_id
  // tiene FK a users.
  async delete(id: string, requesterId: string): Promise<boolean> {
    if (id === requesterId) {
      throw new ValidationError("No podés eliminar tu propio usuario");
    }

    return this.runInTransaction(async ({ users, customers, sessions }) => {
      if (!(await users.getById(id))) return false;

      if (await customers.getByUserId(id)) {
        throw new ConflictError("Este usuario es un cliente: eliminalo desde Clientes");
      }

      await sessions.deleteByUserId(id);
      return users.delete(id);
    });
  }

  // Mandar el mismo rol que ya tiene no es un cambio y se acepta.
  private async ensureRoleCanChange(
    user: User,
    newRole: string,
    requesterId: string,
  ): Promise<void> {
    if (newRole === user.role) return;

    if (await this.customerRepository.getByUserId(user.id)) {
      throw new ValidationError("No se puede cambiar el rol de un usuario que es cliente");
    }
    // Perderia el acceso al backoffice en el acto; si fuera el unico owner, nadie podria
    // volver a administrar la tienda.
    if (user.id === requesterId && user.role === "owner") {
      throw new ValidationError("No podés quitarte el rol owner a vos mismo");
    }
  }

  // Unico punto por donde User sale del service: descarta el password.
  private toPublic(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      created_at: user.created_at,
    };
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
