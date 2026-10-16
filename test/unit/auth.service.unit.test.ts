import { AuthService } from "../../src/auth/auth.service";
import { User } from "../../src/user/user.entity";
import { IUserRepository } from "../../src/user/user.repository.interface";
import { Customer } from "../../src/customer/customer.entity";
import { ICustomerRepository } from "../../src/customer/customer.repository.interface";
import { Session } from "../../src/session/session.entity";
import { ISessionRepository } from "../../src/session/session.repository.interface";
import { ConflictError, ValidationError } from "../../src/errors";
import { validRegistration, validUser } from "../fixtures";

// Fakes en memoria de los tres repositorios que consume AuthService.

// getByEmail replica el LOWER(email) del repo de Postgres: el email no distingue mayusculas.
class FakeUserRepository implements IUserRepository {
  readonly users: User[] = [];

  async create(data: Omit<User, "id" | "created_at">): Promise<User> {
    const user: User = {
      id: `user-${this.users.length + 1}`,
      created_at: "2026-01-01 00:00:00",
      ...data,
    };
    this.users.push(user);
    return user;
  }

  async getById(): Promise<User | null> {
    throw new Error("no usado en estos tests");
  }

  async getByIds(): Promise<User[]> {
    throw new Error("no usado en estos tests");
  }

  async getByEmail(email: string): Promise<User | null> {
    return this.users.find((user) => user.email.toLowerCase() === email.toLowerCase()) ?? null;
  }

  async getAll(): Promise<User[]> {
    throw new Error("no usado en estos tests");
  }

  async update(): Promise<User | null> {
    throw new Error("no usado en estos tests");
  }

  async delete(): Promise<boolean> {
    throw new Error("no usado en estos tests");
  }
}

class FakeCustomerRepository implements ICustomerRepository {
  readonly customers: Customer[] = [];

  async create(data: Omit<Customer, "id" | "created_at">): Promise<Customer> {
    const customer: Customer = {
      id: `cus-${this.customers.length + 1}`,
      created_at: "2026-01-01 00:00:00",
      ...data,
    };
    this.customers.push(customer);
    return customer;
  }

  async getById(): Promise<Customer | null> {
    throw new Error("no usado en estos tests");
  }

  async getByIds(): Promise<Customer[]> {
    throw new Error("no usado en estos tests");
  }

  async getByUserId(userId: string): Promise<Customer | null> {
    return this.customers.find((customer) => customer.user_id === userId) ?? null;
  }

  async getAll(): Promise<Customer[]> {
    throw new Error("no usado en estos tests");
  }

  async update(): Promise<Customer | null> {
    throw new Error("no usado en estos tests");
  }

  async delete(): Promise<boolean> {
    throw new Error("no usado en estos tests");
  }
}

class FakeSessionRepository implements ISessionRepository {
  readonly sessions = new Map<string, Session>();

  async create(userId: string): Promise<Session> {
    const session: Session = {
      token: `token-${this.sessions.size + 1}`,
      user_id: userId,
      expires_at: "2026-01-02 00:00:00+00",
    };
    this.sessions.set(session.token, session);
    return session;
  }

  async getByToken(token: string): Promise<Session | null> {
    return this.sessions.get(token) ?? null;
  }

  async deleteByToken(token: string): Promise<boolean> {
    return this.sessions.delete(token);
  }
}

// Revisa el objeto COMPLETO, a cualquier profundidad: ni la clave "password" ni su valor
// pueden aparecer en lo que el service devuelve (y el controller manda por HTTP).
function expectNoPassword(value: unknown, password: string): void {
  const json = JSON.stringify(value);
  expect(json).not.toContain('"password"');
  expect(json).not.toContain(password);
}

describe("AuthService", () => {
  let userRepository: FakeUserRepository;
  let customerRepository: FakeCustomerRepository;
  let sessionRepository: FakeSessionRepository;
  let service: AuthService;

  beforeEach(() => {
    userRepository = new FakeUserRepository();
    customerRepository = new FakeCustomerRepository();
    sessionRepository = new FakeSessionRepository();
    service = new AuthService(userRepository, customerRepository, sessionRepository);
  });

  describe("register", () => {
    it("crea el usuario con rol cliente y su perfil de cliente vinculado", async () => {
      const result = await service.register(validRegistration);

      expect(userRepository.users).toHaveLength(1);
      expect(customerRepository.customers).toHaveLength(1);
      const user = userRepository.users[0]!;
      const customer = customerRepository.customers[0]!;
      expect(user).toMatchObject({ email: "maria@example.com", role: "cliente" });
      expect(customer).toMatchObject({
        user_id: user.id,
        name: "Maria Gomez",
        tax_status: "consumidor_final",
      });
      expect(result).toEqual({
        user: { id: user.id, email: "maria@example.com", role: "cliente" },
        customer: { id: customer.id, name: "Maria Gomez" },
      });
    });

    it("no devuelve el password en ninguna parte de la respuesta", async () => {
      const result = await service.register(validRegistration);

      expectNoPassword(result, validRegistration.password);
    });

    it("guarda nombre y email sin los espacios de los extremos", async () => {
      await service.register({
        ...validRegistration,
        name: "  Maria Gomez  ",
        email: "  maria@example.com ",
      });

      expect(userRepository.users[0]!.email).toBe("maria@example.com");
      expect(customerRepository.customers[0]!.name).toBe("Maria Gomez");
    });

    it("rechaza con ConflictError un email ya registrado, sin importar mayúsculas", async () => {
      await service.register(validRegistration);

      await expect(
        service.register({ ...validRegistration, email: "MARIA@example.com" }),
      ).rejects.toThrow(new ConflictError("Ya existe una cuenta con ese email"));
      expect(userRepository.users).toHaveLength(1);
      expect(customerRepository.customers).toHaveLength(1);
    });

    it.each([
      ["nombre vacío", { name: "" }, "El campo 'name' es obligatorio"],
      ["nombre con solo espacios", { name: "   " }, "El campo 'name' es obligatorio"],
      ["nombre ausente", { name: undefined }, "El campo 'name' es obligatorio"],
      [
        "email sin arroba",
        { email: "maria.example.com" },
        "El campo 'email' debe ser un email válido",
      ],
      ["email ausente", { email: undefined }, "El campo 'email' debe ser un email válido"],
      [
        "password de 5 caracteres",
        { password: "12345" },
        "El campo 'password' debe tener al menos 6 caracteres",
      ],
      [
        "password ausente",
        { password: undefined },
        "El campo 'password' debe tener al menos 6 caracteres",
      ],
    ])("rechaza con ValidationError: %s, sin crear nada", async (_caso, override, message) => {
      await expect(service.register({ ...validRegistration, ...override })).rejects.toThrow(
        new ValidationError(message),
      );
      expect(userRepository.users).toHaveLength(0);
      expect(customerRepository.customers).toHaveLength(0);
    });

    it("acepta un password de exactamente 6 caracteres", async () => {
      await service.register({ ...validRegistration, password: "123456" });

      expect(userRepository.users[0]!.password).toBe("123456");
    });
  });

  describe("login", () => {
    beforeEach(async () => {
      await service.register(validRegistration);
    });

    it("con credenciales correctas devuelve el token de una sesión nueva y el customer_id", async () => {
      const result = await service.login({
        email: validRegistration.email,
        password: validRegistration.password,
      });

      const user = userRepository.users[0]!;
      expect(result).toEqual({
        id: user.id,
        email: user.email,
        role: "cliente",
        customer_id: customerRepository.customers[0]!.id,
        token: expect.any(String),
      });
      expect(sessionRepository.sessions.get(result.token)?.user_id).toBe(user.id);
    });

    it("no devuelve el password en ninguna parte de la respuesta", async () => {
      const result = await service.login({
        email: validRegistration.email,
        password: validRegistration.password,
      });

      expectNoPassword(result, validRegistration.password);
    });

    it("el email no distingue mayúsculas", async () => {
      await expect(
        service.login({ email: "MARIA@Example.com", password: validRegistration.password }),
      ).resolves.toMatchObject({ id: userRepository.users[0]!.id });
    });

    it("con password incorrecta lanza ValidationError y no crea sesión", async () => {
      await expect(
        service.login({ email: validRegistration.email, password: "incorrecta" }),
      ).rejects.toThrow(ValidationError);
      expect(sessionRepository.sessions.size).toBe(0);
    });

    // Si los mensajes difirieran, un atacante podria averiguar que emails estan registrados
    // probando el login (enumeracion de cuentas).
    it("con un email inexistente lanza el MISMO error que con password incorrecta", async () => {
      const wrongPassword = await service
        .login({ email: validRegistration.email, password: "incorrecta" })
        .catch((error: unknown) => error);
      const unknownEmail = await service
        .login({ email: "nadie@example.com", password: validRegistration.password })
        .catch((error: unknown) => error);

      expect(unknownEmail).toBeInstanceOf(ValidationError);
      expect(wrongPassword).toBeInstanceOf(ValidationError);
      expect((unknownEmail as Error).message).toBe((wrongPassword as Error).message);
      expect(sessionRepository.sessions.size).toBe(0);
    });

    // El dueño no tiene perfil de cliente: el front usa customer_id null para no ofrecerle
    // carrito ni perfil.
    it("de un owner devuelve customer_id null", async () => {
      await userRepository.create({ ...validUser, email: "owner@example.com", role: "owner" });

      const result = await service.login({
        email: "owner@example.com",
        password: validUser.password,
      });

      expect(result.role).toBe("owner");
      expect(result.customer_id).toBeNull();
      expect(result.token).toEqual(expect.any(String));
    });

    it.each([
      ["email", { email: "" }],
      ["password", { password: "   " }],
    ])("exige el campo %s", async (field, override) => {
      await expect(
        service.login({
          email: validRegistration.email,
          password: validRegistration.password,
          ...override,
        }),
      ).rejects.toThrow(new ValidationError(`El campo '${field}' es obligatorio`));
    });
  });

  describe("logout", () => {
    it("borra la sesión del token y deja las demás", async () => {
      await service.register(validRegistration);
      const credentials = { email: validRegistration.email, password: validRegistration.password };
      const { token } = await service.login(credentials);
      const { token: otherToken } = await service.login(credentials);

      await service.logout(token);

      await expect(sessionRepository.getByToken(token)).resolves.toBeNull();
      await expect(sessionRepository.getByToken(otherToken)).resolves.not.toBeNull();
    });
  });
});
