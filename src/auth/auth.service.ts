import { IUserRepository } from "../user/user.repository.interface";
import { ICustomerRepository } from "../customer/customer.repository.interface";
import { ConflictError, ValidationError } from "../errors";

export class AuthService {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly customerRepo: ICustomerRepository,
  ) {}

  async register(input: { name?: unknown; email?: unknown; password?: unknown }) {
    const name = this.validateName(input.name);
    const email = this.validateEmail(input.email);
    const password = this.validatePassword(input.password);

    const existing = await this.userRepo.getByEmail(email);
    if (existing) {
      throw new ConflictError("Ya existe una cuenta con ese email");
    }

    const user = await this.userRepo.create({ email, password, role: "cliente" });
    const customer = await this.customerRepo.create({
      user_id: user.id,
      name,
      government_id: null,
      tax_status: "consumidor_final",
      phone: null,
      address: null,
    });

    return {
      user: { id: user.id, email: user.email, role: user.role },
      customer: { id: customer.id, name: customer.name },
    };
  }

  async login(input: { email?: unknown; password?: unknown }) {
    const email = this.validatePresence(input.email, "email");
    const password = this.validatePresence(input.password, "password");

    const user = await this.userRepo.getByEmail(email);
    if (!user || password !== user.password) {
      throw new ValidationError("Credenciales inválidas");
    }

    const customer = await this.customerRepo.getByUserId(user.id);

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      customer_id: customer?.id ?? null,
    };
  }

  private validateName(value: unknown): string {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new ValidationError("El campo 'name' es obligatorio");
    }
    return value.trim();
  }

  private validateEmail(value: unknown): string {
    if (typeof value !== "string" || !value.includes("@")) {
      throw new ValidationError("El campo 'email' debe ser un email válido");
    }
    return value.trim();
  }

  private validatePassword(value: unknown): string {
    if (typeof value !== "string" || value.length < 6) {
      throw new ValidationError("El campo 'password' debe tener al menos 6 caracteres");
    }
    return value;
  }

  private validatePresence(value: unknown, field: string): string {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new ValidationError(`El campo '${field}' es obligatorio`);
    }
    return value.trim();
  }
}
