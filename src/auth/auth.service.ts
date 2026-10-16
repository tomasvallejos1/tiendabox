import { IUserRepository } from "../user/user.repository.interface";
import { ICustomerRepository } from "../customer/customer.repository.interface";
import { ISessionRepository } from "../session/session.repository.interface";
import { ConflictError, ValidationError } from "../errors";

// Repositorios que el alta usa dentro de una misma transaccion.
export interface RegistrationRepositories {
  users: IUserRepository;
  customers: ICustomerRepository;
}

// Ejecuta work de forma atomica con repositorios atados a una transaccion: si work lanza,
// no queda nada guardado. El service no sabe de que base se trata; la implementacion real
// la arma DatabaseProviderFactory.
export type RunInTransaction = <T>(
  work: (repos: RegistrationRepositories) => Promise<T>,
) => Promise<T>;

export class AuthService {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly customerRepo: ICustomerRepository,
    private readonly sessionRepo: ISessionRepository,
    private readonly runInTransaction: RunInTransaction,
  ) {}

  async register(input: { name?: unknown; email?: unknown; password?: unknown }) {
    const name = this.validateName(input.name);
    const email = this.validateEmail(input.email);
    const password = this.validatePassword(input.password);

    // Usuario y cliente se crean juntos o ninguno: si el cliente falla, un usuario suelto
    // dejaria tomado el email y una cuenta sin perfil que no puede comprar.
    return this.runInTransaction(async ({ users, customers }) => {
      const existing = await users.getByEmail(email);
      if (existing) {
        throw new ConflictError("Ya existe una cuenta con ese email");
      }

      const user = await users.create({ email, password, role: "cliente" });
      const customer = await customers.create({
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
    });
  }

  async login(input: { email?: unknown; password?: unknown }) {
    const email = this.validatePresence(input.email, "email");
    // El password nunca se recorta: los espacios son parte de la contraseña, y register
    // lo guarda tal cual.
    if (typeof input.password !== "string" || input.password.length === 0) {
      throw new ValidationError("El campo 'password' es obligatorio");
    }
    const password = input.password;

    const user = await this.userRepo.getByEmail(email);
    if (!user || password !== user.password) {
      throw new ValidationError("Credenciales inválidas");
    }

    const customer = await this.customerRepo.getByUserId(user.id);

    const session = await this.sessionRepo.create(user.id);

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      customer_id: customer?.id ?? null,
      token: session.token,
    };
  }

  async logout(token: string): Promise<void> {
    await this.sessionRepo.deleteByToken(token);
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

  // Sin trim, igual que en login: se guarda exactamente lo que escribio el usuario.
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
