import crypto from "crypto";
import { Customer, CustomerWithEmail } from "./customer.entity";
import { ICustomerRepository } from "./customer.repository.interface";
import type { IUserRepository } from "../user/user.repository.interface";
import { ConflictError, ForbiddenError, ValidationError } from "../errors";

// Valores validos para tax_status.
const VALID_TAX_STATUSES = [
  "consumidor_final",
  "responsable_inscripto",
  "monotributo",
  "exento",
] as const;
const DEFAULT_TAX_STATUS = "consumidor_final";
const PASSWORD_MIN_LENGTH = 6;
const GENERATED_PASSWORD_LENGTH = 10;
const PASSWORD_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

// Resultado de create. generated_password trae la contraseña SOLO si la genero el
// sistema; si la mando el dueño o el cliente no tiene cuenta, va null.
export interface CreateCustomerResult {
  customer: Customer;
  generated_password: string | null;
}

// Reglas de negocio de Customer. Delega la persistencia en el repositorio.
export class CustomerService {
  constructor(
    private readonly repository: ICustomerRepository,
    private readonly userRepository: IUserRepository,
  ) {}

  // Suma el email de la cuenta web de cada cliente (null para los de local).
  // Los usuarios se piden por lote: una sola consulta, sin importar cuantos clientes haya.
  async getAll(): Promise<CustomerWithEmail[]> {
    const customers = await this.repository.getAll();

    const userIds = customers
      .map((customer) => customer.user_id)
      .filter((userId): userId is string => userId !== null);
    const users = await this.userRepository.getByIds(userIds);
    const emailByUserId = new Map(users.map((user) => [user.id, user.email]));

    return customers.map((customer) => ({
      ...customer,
      email: customer.user_id ? (emailByUserId.get(customer.user_id) ?? null) : null,
    }));
  }

  // Misma regla de pertenencia que update: el owner ve cualquier cliente,
  // el resto solo el propio.
  async getById(id: string, userId: string, role: string): Promise<Customer | null> {
    if (role !== "owner") {
      const own = await this.repository.getByUserId(userId);
      if (!own || own.id !== id) {
        throw new ForbiddenError("No tiene permiso para ver este cliente");
      }
    }

    return this.repository.getById(id);
  }

  // Sin email crea un cliente de local (user_id null). Con email crea ademas la
  // cuenta web y la vincula al cliente.
  async create(input: {
    user_id?: unknown;
    name?: unknown;
    government_id?: unknown;
    tax_status?: unknown;
    phone?: unknown;
    address?: unknown;
    email?: unknown;
    password?: unknown;
  }): Promise<CreateCustomerResult> {
    const user_id = this.normalizeUserId(input.user_id);
    const name = this.validateName(input.name);
    const government_id = this.validateGovernmentId(input.government_id);
    const tax_status = this.validateTaxStatus(input.tax_status);
    const phone = this.normalizeOptionalString(input.phone);
    const address = this.normalizeOptionalString(input.address);
    const email = this.normalizeEmail(input.email);
    const profile = { name, government_id, tax_status, phone, address };

    if (email === null) {
      if (this.isPresent(input.password)) {
        throw new ValidationError("El campo 'password' requiere que se envíe 'email'");
      }
      const customer = await this.repository.create({ user_id, ...profile });
      return { customer, generated_password: null };
    }

    if (user_id !== null) {
      throw new ValidationError("No se puede enviar 'user_id' y 'email' a la vez");
    }

    const providedPassword = this.normalizePassword(input.password);
    const password = providedPassword ?? this.generatePassword();

    const existing = await this.userRepository.getByEmail(email);
    if (existing) {
      throw new ConflictError("Ya existe una cuenta con ese email");
    }

    const user = await this.userRepository.create({ email, password, role: "cliente" });

    // No es transaccional: usuario y cliente se crean en dos pasos. Si el cliente
    // falla, se borra el usuario recien creado para no dejarlo huerfano.
    let customer: Customer;
    try {
      customer = await this.repository.create({ user_id: user.id, ...profile });
    } catch (error) {
      await this.userRepository.delete(user.id);
      throw error;
    }

    return { customer, generated_password: providedPassword === null ? password : null };
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
    userId: string,
    role: string,
  ): Promise<Customer | null> {
    // Validar pertenencia: solo el owner puede editar cualquier cliente.
    if (role !== "owner") {
      const own = await this.repository.getByUserId(userId);
      if (!own || own.id !== id) {
        throw new ForbiddenError("No tiene permiso para modificar este cliente");
      }
    }

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

  // user_id opcional: si no viene o viene vacio es un cliente de local (null).
  private normalizeUserId(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== "string") {
      throw new ValidationError("El campo 'user_id' debe ser un string");
    }
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }

  // email opcional: si no viene o viene vacio no se crea cuenta web (null).
  private normalizeEmail(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== "string") {
      throw new ValidationError("El campo 'email' debe ser un email válido");
    }
    const email = value.trim();
    if (email.length === 0) return null;
    if (!email.includes("@")) {
      throw new ValidationError("El campo 'email' debe ser un email válido");
    }
    return email;
  }

  // password opcional: si no viene o viene vacio devuelve null y la genera el sistema.
  private normalizePassword(value: unknown): string | null {
    if (!this.isPresent(value)) return null;
    if (typeof value !== "string" || value.length < PASSWORD_MIN_LENGTH) {
      throw new ValidationError(
        `El campo 'password' debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`,
      );
    }
    return value;
  }

  private isPresent(value: unknown): boolean {
    return value !== undefined && value !== null && value !== "";
  }

  // Contraseña alfanumerica aleatoria. crypto.randomInt evita el sesgo de Math.random.
  private generatePassword(): string {
    let password = "";
    for (let i = 0; i < GENERATED_PASSWORD_LENGTH; i++) {
      password += PASSWORD_ALPHABET[crypto.randomInt(PASSWORD_ALPHABET.length)];
    }
    return password;
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
