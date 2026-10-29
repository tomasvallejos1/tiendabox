import { AuthService, RunInTransaction } from "../../src/auth/auth.service";
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

  async getById(id: string): Promise<User | null> {
    return this.users.find((user) => user.id === id) ?? null;
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

  // Reemplaza el objeto en vez de mutarlo: FakeTransaction comparte las mismas referencias.
  async update(id: string, data: Partial<Omit<User, "id" | "created_at">>): Promise<User | null> {
    const index = this.users.findIndex((user) => user.id === id);
    if (index === -1) return null;
    const updated: User = { ...this.users[index]!, ...data };
    this.users[index] = updated;
    return updated;
  }

  async delete(): Promise<boolean> {
    throw new Error("no usado en estos tests");
  }
}

// failOnCreate simula una caida de la base justo al insertar el cliente.
class FakeCustomerRepository implements ICustomerRepository {
  readonly customers: Customer[] = [];
  failOnCreate = false;

  async create(data: Omit<Customer, "id" | "created_at">): Promise<Customer> {
    if (this.failOnCreate) {
      throw new Error("fallo simulado al crear el cliente");
    }
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

// El token sale de un contador y no del tamaño del Map: despues de borrar sesiones, el
// tamaño baja y un token nuevo pisaria a uno que sigue vivo.
class FakeSessionRepository implements ISessionRepository {
  readonly sessions = new Map<string, Session>();
  private created = 0;

  async create(userId: string): Promise<Session> {
    this.created++;
    const session: Session = {
      token: `token-${this.created}`,
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

  async deleteByUserIdExcept(userId: string, keepToken: string): Promise<number> {
    const toDelete = [...this.sessions.values()].filter(
      (session) => session.user_id === userId && session.token !== keepToken,
    );
    toDelete.forEach((session) => this.sessions.delete(session.token));
    return toDelete.length;
  }
}

// Transaccion en memoria: le pasa al trabajo COPIAS de los repos y solo vuelca los cambios
// si termina bien, como un COMMIT. Si el service escribiera por fuera de la transaccion
// (con los repos del constructor), los tests de atomicidad lo detectarian.
class FakeTransaction {
  calls = 0;
  failCustomerCreate = false;

  constructor(
    private readonly users: FakeUserRepository,
    private readonly customers: FakeCustomerRepository,
  ) {}

  readonly run: RunInTransaction = async (work) => {
    this.calls++;
    const txUsers = new FakeUserRepository();
    txUsers.users.push(...this.users.users);
    const txCustomers = new FakeCustomerRepository();
    txCustomers.customers.push(...this.customers.customers);
    txCustomers.failOnCreate = this.failCustomerCreate;

    const result = await work({ users: txUsers, customers: txCustomers });

    this.users.users.splice(0, this.users.users.length, ...txUsers.users);
    this.customers.customers.splice(0, this.customers.customers.length, ...txCustomers.customers);
    return result;
  };
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
  let transaction: FakeTransaction;
  let service: AuthService;

  beforeEach(() => {
    userRepository = new FakeUserRepository();
    customerRepository = new FakeCustomerRepository();
    sessionRepository = new FakeSessionRepository();
    transaction = new FakeTransaction(userRepository, customerRepository);
    service = new AuthService(
      userRepository,
      customerRepository,
      sessionRepository,
      transaction.run,
    );
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

    // Los espacios son parte de la contraseña: recortarla cambiaria lo que el usuario eligio.
    it("guarda el password tal cual, con los espacios de los extremos", async () => {
      await service.register({ ...validRegistration, password: "  secreto123  " });

      expect(userRepository.users[0]!.password).toBe("  secreto123  ");
    });

    it("crea usuario y cliente dentro de una sola transacción", async () => {
      await service.register(validRegistration);

      expect(transaction.calls).toBe(1);
    });

    // Regresion: el usuario se creaba aunque fallara el cliente, y quedaba una cuenta sin
    // perfil con el email tomado.
    it("si falla la creación del cliente no queda ningún usuario guardado", async () => {
      transaction.failCustomerCreate = true;

      await expect(service.register(validRegistration)).rejects.toThrow(
        "fallo simulado al crear el cliente",
      );
      expect(userRepository.users).toHaveLength(0);
      expect(customerRepository.customers).toHaveLength(0);

      // El email no quedo tomado: el mismo registro funciona cuando la base se recupera.
      transaction.failCustomerCreate = false;
      await expect(service.register(validRegistration)).resolves.toBeDefined();
      expect(userRepository.users).toHaveLength(1);
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
      // Se lee antes de llamar a login: si el argumento de toMatchObject lanzara, la promesa
      // de login quedaria rechazada sin manejar y tiraria abajo todo el proceso de Jest.
      const userId = userRepository.users[0]?.id;

      await expect(
        service.login({ email: "MARIA@Example.com", password: validRegistration.password }),
      ).resolves.toMatchObject({ id: userId });
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
      ["password", { password: "" }],
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

  // Regresion: login recortaba el password y register no, asi que una contraseña con
  // espacios en los extremos nunca podia entrar.
  describe("login sin recortar el password", () => {
    it("entra con un password que tiene espacios en los extremos", async () => {
      await service.register({ ...validRegistration, password: "  secreto123  " });

      await expect(
        service.login({ email: validRegistration.email, password: "  secreto123  " }),
      ).resolves.toMatchObject({ email: validRegistration.email });
    });

    it("rechaza el password con espacios de más", async () => {
      await service.register(validRegistration);

      await expect(
        service.login({
          email: validRegistration.email,
          password: `${validRegistration.password} `,
        }),
      ).rejects.toThrow(new ValidationError("Credenciales inválidas"));
    });

    // Un password de solo espacios es un password (incorrecto), no un campo vacio.
    it("trata un password de solo espacios como credencial inválida, no como campo vacío", async () => {
      await service.register(validRegistration);

      await expect(
        service.login({ email: validRegistration.email, password: "   " }),
      ).rejects.toThrow(new ValidationError("Credenciales inválidas"));
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

  describe("changePassword", () => {
    const credentials = { email: validRegistration.email, password: validRegistration.password };
    let userId: string;
    let token: string;

    beforeEach(async () => {
      await service.register(validRegistration);
      userId = userRepository.users[0]!.id;
      ({ token } = await service.login(credentials));
    });

    it("cambia la contraseña: después entra con la nueva y no con la vieja", async () => {
      await service.changePassword(userId, token, {
        current_password: validRegistration.password,
        new_password: "nueva-clave",
      });

      await expect(
        service.login({ email: validRegistration.email, password: "nueva-clave" }),
      ).resolves.toMatchObject({ id: userId });
      await expect(service.login(credentials)).rejects.toThrow(
        new ValidationError("Credenciales inválidas"),
      );
    });

    it("con la contraseña actual incorrecta lanza ValidationError y no la cambia", async () => {
      await expect(
        service.changePassword(userId, token, {
          current_password: "incorrecta",
          new_password: "nueva-clave",
        }),
      ).rejects.toThrow(new ValidationError("La contraseña actual es incorrecta"));
      expect(userRepository.users[0]!.password).toBe(validRegistration.password);
    });

    it.each([
      ["demasiado corta", "12345", "El campo 'password' debe tener al menos 6 caracteres"],
      [
        "igual a la actual",
        validRegistration.password,
        "La nueva contraseña debe ser distinta de la actual",
      ],
    ])(
      "rechaza una nueva contraseña %s, sin cambiar la actual",
      async (_caso, newPassword, message) => {
        await expect(
          service.changePassword(userId, token, {
            current_password: validRegistration.password,
            new_password: newPassword,
          }),
        ).rejects.toThrow(new ValidationError(message));
        expect(userRepository.users[0]!.password).toBe(validRegistration.password);
      },
    );

    it.each([
      ["ausente", undefined],
      ["vacía", ""],
    ])("exige current_password: %s", async (_caso, currentPassword) => {
      await expect(
        service.changePassword(userId, token, {
          current_password: currentPassword,
          new_password: "nueva-clave",
        }),
      ).rejects.toThrow(new ValidationError("El campo 'current_password' es obligatorio"));
    });

    // Igual que en login: nada se recorta, " secreto" y "secreto" son contraseñas distintas.
    it("los espacios cuentan: ' secreto' no es lo mismo que 'secreto'", async () => {
      const other = await userRepository.create({
        ...validUser,
        email: "espacios@example.com",
        password: "secreto",
      });

      await expect(
        service.changePassword(other.id, "token-x", {
          current_password: " secreto",
          new_password: "nueva-clave",
        }),
      ).rejects.toThrow(new ValidationError("La contraseña actual es incorrecta"));

      await service.changePassword(other.id, "token-x", {
        current_password: "secreto",
        new_password: " secreto",
      });
      expect((await userRepository.getById(other.id))!.password).toBe(" secreto");
    });

    it("cierra las otras sesiones del usuario, conserva la actual y no toca las de otro usuario", async () => {
      const { token: otherSession } = await service.login(credentials);
      await userRepository.create({ ...validUser, email: "otro@example.com" });
      const { token: otherUserSession } = await service.login({
        email: "otro@example.com",
        password: validUser.password,
      });

      await service.changePassword(userId, token, {
        current_password: validRegistration.password,
        new_password: "nueva-clave",
      });

      await expect(sessionRepository.getByToken(token)).resolves.not.toBeNull();
      await expect(sessionRepository.getByToken(otherSession)).resolves.toBeNull();
      await expect(sessionRepository.getByToken(otherUserSession)).resolves.not.toBeNull();
    });
  });
});
