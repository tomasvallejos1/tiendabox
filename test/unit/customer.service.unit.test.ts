import { CustomerService } from "../../src/customer/customer.service";
import { Customer } from "../../src/customer/customer.entity";
import { ICustomerRepository } from "../../src/customer/customer.repository.interface";
import { User } from "../../src/user/user.entity";
import { IUserRepository } from "../../src/user/user.repository.interface";
import { Cart } from "../../src/cart/cart.entity";
import { ICartRepository } from "../../src/cart/cart.repository.interface";
import { Session } from "../../src/session/session.entity";
import { ISessionRepository } from "../../src/session/session.repository.interface";
import { IOrderRepository } from "../../src/order/order.repository.interface";
import type { RunInTransaction } from "../../src/db/run-in-transaction";
import { ConflictError, ValidationError } from "../../src/errors";
import { stubRepository, validCustomer } from "../fixtures";

// Fake en memoria de ICustomerRepository. failOnCreate simula una caida de la base
// justo al insertar el cliente.
class FakeCustomerRepository implements ICustomerRepository {
  readonly customers: Customer[] = [];
  failOnCreate = false;
  getByIdCalls = 0;

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

  async getById(id: string): Promise<Customer | null> {
    this.getByIdCalls++;
    return this.customers.find((customer) => customer.id === id) ?? null;
  }

  async getByIds(): Promise<Customer[]> {
    throw new Error("no usado en estos tests");
  }

  async getByUserId(userId: string): Promise<Customer | null> {
    return this.customers.find((customer) => customer.user_id === userId) ?? null;
  }

  async getAll(): Promise<Customer[]> {
    return this.customers;
  }

  async update(
    id: string,
    data: Partial<Omit<Customer, "id" | "user_id" | "created_at">>,
  ): Promise<Customer | null> {
    const customer = this.customers.find((customer) => customer.id === id);
    if (!customer) return null;
    Object.assign(customer, data);
    return customer;
  }

  async delete(id: string): Promise<boolean> {
    const index = this.customers.findIndex((customer) => customer.id === id);
    if (index === -1) return false;
    this.customers.splice(index, 1);
    return true;
  }

  copy(): FakeCustomerRepository {
    const copy = new FakeCustomerRepository();
    copy.customers.push(...this.customers.map((customer) => ({ ...customer })));
    return copy;
  }
}

// Fake en memoria de IUserRepository. getByIdsCalls permite verificar que el
// listado pide los usuarios en una sola llamada.
class FakeUserRepository implements IUserRepository {
  readonly users: User[] = [];
  getByIdsCalls = 0;

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

  async getByIds(ids: string[]): Promise<User[]> {
    this.getByIdsCalls++;
    return this.users.filter((user) => ids.includes(user.id));
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

  failOnDelete = false;

  async delete(id: string): Promise<boolean> {
    if (this.failOnDelete) {
      throw new Error("fallo simulado al borrar el usuario");
    }
    const index = this.users.findIndex((user) => user.id === id);
    if (index === -1) return false;
    this.users.splice(index, 1);
    return true;
  }

  copy(): FakeUserRepository {
    const copy = new FakeUserRepository();
    copy.users.push(...this.users.map((user) => ({ ...user })));
    return copy;
  }
}

// Carritos en memoria, con sus items adentro: borrar el carrito borra los items.
class FakeCartRepository {
  readonly carts: Cart[] = [];

  async deleteByCustomerId(customerId: string): Promise<void> {
    const kept = this.carts.filter((cart) => cart.customer_id !== customerId);
    this.carts.splice(0, this.carts.length, ...kept);
  }

  copy(): FakeCartRepository {
    const copy = new FakeCartRepository();
    copy.carts.push(...this.carts.map((cart) => ({ ...cart, items: [...cart.items] })));
    return copy;
  }
}

class FakeSessionRepository {
  readonly sessions: Session[] = [];

  async deleteByUserId(userId: string): Promise<number> {
    const kept = this.sessions.filter((session) => session.user_id !== userId);
    const deleted = this.sessions.length - kept.length;
    this.sessions.splice(0, this.sessions.length, ...kept);
    return deleted;
  }

  copy(): FakeSessionRepository {
    const copy = new FakeSessionRepository();
    copy.sessions.push(...this.sessions.map((session) => ({ ...session })));
    return copy;
  }
}

// Solo importa que clientes tienen pedidos.
class FakeOrderRepository {
  readonly customerIdsWithOrders = new Set<string>();

  async existsForCustomer(customerId: string): Promise<boolean> {
    return this.customerIdsWithOrders.has(customerId);
  }
}

// Transaccion en memoria: le pasa al trabajo COPIAS de los repos y solo vuelca los cambios
// si termina bien, como un COMMIT. Si el service escribiera por fuera de la transaccion
// (con los repos del constructor), el volcado final lo pisaria y los tests lo detectarian.
class FakeTransaction {
  calls = 0;

  constructor(
    private readonly db: {
      customers: FakeCustomerRepository;
      users: FakeUserRepository;
      carts: FakeCartRepository;
      sessions: FakeSessionRepository;
      orders: FakeOrderRepository;
    },
  ) {}

  readonly run: RunInTransaction = async (work) => {
    this.calls++;
    const customers = this.db.customers.copy();
    const users = this.db.users.copy();
    users.failOnDelete = this.db.users.failOnDelete;
    const carts = this.db.carts.copy();
    const sessions = this.db.sessions.copy();

    const result = await work({
      customers,
      users,
      carts: stubRepository<ICartRepository>("carts", carts),
      sessions: stubRepository<ISessionRepository>("sessions", sessions),
      orders: stubRepository<IOrderRepository>("orders", this.db.orders),
    });

    this.db.customers.customers.splice(0, Infinity, ...customers.customers);
    this.db.users.users.splice(0, Infinity, ...users.users);
    this.db.carts.carts.splice(0, Infinity, ...carts.carts);
    this.db.sessions.sessions.splice(0, Infinity, ...sessions.sessions);
    return result;
  };
}

describe("CustomerService", () => {
  let customerRepository: FakeCustomerRepository;
  let userRepository: FakeUserRepository;
  let cartRepository: FakeCartRepository;
  let sessionRepository: FakeSessionRepository;
  let orderRepository: FakeOrderRepository;
  let transaction: FakeTransaction;
  let service: CustomerService;

  beforeEach(() => {
    customerRepository = new FakeCustomerRepository();
    userRepository = new FakeUserRepository();
    cartRepository = new FakeCartRepository();
    sessionRepository = new FakeSessionRepository();
    orderRepository = new FakeOrderRepository();
    transaction = new FakeTransaction({
      customers: customerRepository,
      users: userRepository,
      carts: cartRepository,
      sessions: sessionRepository,
      orders: orderRepository,
    });
    service = new CustomerService(customerRepository, userRepository, transaction.run);
  });

  describe("create", () => {
    it.each(["1234567", "12345678", "20123456789"])(
      "consumidor final acepta el documento %s",
      async (government_id) => {
        const result = await service.create({
          name: "Maria Gomez",
          tax_status: "consumidor_final",
          government_id,
        });

        expect(result.customer.government_id).toBe(government_id);
      },
    );

    it.each(["123456789", "1234567890", "123456789012"])(
      "consumidor final rechaza el documento %s",
      async (government_id) => {
        await expect(
          service.create({ name: "Maria Gomez", tax_status: "consumidor_final", government_id }),
        ).rejects.toThrow(
          new ValidationError("El documento debe ser un DNI de 7 u 8 dígitos o un CUIT/CUIL de 11"),
        );
        expect(customerRepository.customers).toHaveLength(0);
      },
    );

    it.each(["responsable_inscripto", "monotributo", "exento"])(
      "%s acepta CUIT de 11 digitos y rechaza DNI de 8",
      async (tax_status) => {
        const result = await service.create({
          name: "Maria Gomez",
          tax_status,
          government_id: "20123456789",
        });

        expect(result.customer.government_id).toBe("20123456789");
        await expect(
          service.create({ name: "Maria Gomez", tax_status, government_id: "12345678" }),
        ).rejects.toThrow(new ValidationError("El CUIT debe tener 11 dígitos numéricos"));
        expect(customerRepository.customers).toHaveLength(1);
      },
    );

    describe.each(["consumidor_final", "responsable_inscripto", "monotributo", "exento"])(
      "documento con condicion fiscal %s",
      (tax_status) => {
        it.each([undefined, null, "", "   "])(
          "normaliza el documento opcional %p a null",
          async (government_id) => {
            const result = await service.create({ name: "Maria Gomez", tax_status, government_id });

            expect(result.customer.government_id).toBeNull();
          },
        );

        it.each(["abcdefgh", "20abcdefgh9", "12.345.678", "20-12345678-9"])(
          "rechaza letras y separadores en %s",
          async (government_id) => {
            const message =
              tax_status === "consumidor_final"
                ? "El documento debe ser un DNI de 7 u 8 dígitos o un CUIT/CUIL de 11"
                : "El CUIT debe tener 11 dígitos numéricos";

            await expect(
              service.create({ name: "Maria Gomez", tax_status, government_id }),
            ).rejects.toThrow(new ValidationError(message));
            expect(customerRepository.customers).toHaveLength(0);
          },
        );
      },
    );

    it("sin condicion fiscal acepta DNI y usa consumidor_final", async () => {
      const result = await service.create({ name: "Maria Gomez", government_id: "12345678" });

      expect(result.customer.tax_status).toBe("consumidor_final");
      expect(result.customer.government_id).toBe("12345678");
    });

    it("sin email crea un cliente de local: user_id null y ninguna cuenta", async () => {
      const result = await service.create({ name: "Maria Gomez", phone: "3411234567" });

      expect(result.customer.user_id).toBeNull();
      expect(result.customer.name).toBe("Maria Gomez");
      expect(result.generated_password).toBeNull();
      expect(userRepository.users).toHaveLength(0);
    });

    it("con email y sin password crea la cuenta y devuelve la contraseña generada", async () => {
      const result = await service.create({ name: "Carlos Diaz", email: "carlos@example.com" });

      expect(userRepository.users).toHaveLength(1);
      const user = userRepository.users[0]!;
      expect(user.email).toBe("carlos@example.com");
      expect(user.role).toBe("cliente");
      expect(result.customer.user_id).toBe(user.id);
      expect(result.generated_password).toMatch(/^[A-Za-z0-9]{10}$/);
      expect(user.password).toBe(result.generated_password);
    });

    it("con email y password usa la del dueño y no la devuelve", async () => {
      const result = await service.create({
        name: "Carlos Diaz",
        email: "carlos@example.com",
        password: "secreto123",
      });

      expect(userRepository.users[0]!.password).toBe("secreto123");
      expect(result.generated_password).toBeNull();
    });

    it("rechaza un email ya usado sin crear nada", async () => {
      await service.create({ name: "Carlos Diaz", email: "carlos@example.com" });

      await expect(
        service.create({ name: "Otro Carlos", email: "CARLOS@example.com" }),
      ).rejects.toThrow(new ConflictError("Ya existe una cuenta con ese email"));
      expect(userRepository.users).toHaveLength(1);
      expect(customerRepository.customers).toHaveLength(1);
    });

    it("rechaza un email con formato invalido", async () => {
      await expect(service.create({ name: "Carlos Diaz", email: "sin-arroba" })).rejects.toThrow(
        "El campo 'email' debe ser un email válido",
      );
      expect(userRepository.users).toHaveLength(0);
    });

    it("si falla la creacion del cliente borra el usuario recien creado", async () => {
      customerRepository.failOnCreate = true;

      await expect(
        service.create({ name: "Carlos Diaz", email: "carlos@example.com" }),
      ).rejects.toThrow("fallo simulado al crear el cliente");
      expect(userRepository.users).toHaveLength(0);
    });
  });

  describe("update", () => {
    it.each([
      {
        tax_status: "consumidor_final",
        government_id: "12345678",
        input: { tax_status: "monotributo" },
      },
      {
        tax_status: "responsable_inscripto",
        government_id: "20123456789",
        input: { government_id: "12345678" },
      },
    ])("rechaza la combinacion final al enviar solo $input", async (testCase) => {
      const customer = {
        ...validCustomer,
        id: "cus-1",
        tax_status: testCase.tax_status,
        government_id: testCase.government_id,
      };
      customerRepository.customers.push(customer);

      await expect(service.update(customer.id, testCase.input, "owner-1", "owner")).rejects.toThrow(
        new ValidationError("El CUIT debe tener 11 dígitos numéricos"),
      );
      expect(customerRepository.customers[0]).toEqual({
        ...validCustomer,
        id: customer.id,
        tax_status: testCase.tax_status,
        government_id: testCase.government_id,
      });
      expect(customerRepository.getByIdCalls).toBe(1);
    });

    it.each([
      { tax_status: "monotributo", government_id: "20123456789" },
      { tax_status: "responsable_inscripto", government_id: "20123456789" },
      { tax_status: "consumidor_final", government_id: "1234567" },
    ])("acepta cambiar ambos campos a $tax_status y $government_id", async (input) => {
      customerRepository.customers.push({
        ...validCustomer,
        id: "cus-1",
        government_id: "12345678",
      });

      const result = await service.update("cus-1", input, "owner-1", "owner");

      expect(result).toEqual({ ...validCustomer, id: "cus-1", ...input });
      expect(customerRepository.getByIdCalls).toBe(1);
    });

    it.each([null, ""])("permite borrar el documento con %p", async (government_id) => {
      customerRepository.customers.push({
        ...validCustomer,
        id: "cus-1",
        tax_status: "responsable_inscripto",
        government_id: "20123456789",
      });

      const result = await service.update("cus-1", { government_id }, "owner-1", "owner");

      expect(result?.government_id).toBeNull();
      expect(result?.tax_status).toBe("responsable_inscripto");
    });

    it("permite cambiar solo la condicion fiscal si el documento guardado es valido", async () => {
      customerRepository.customers.push({
        ...validCustomer,
        id: "cus-1",
        government_id: "20123456789",
      });

      const result = await service.update(
        "cus-1",
        { tax_status: "monotributo" },
        "owner-1",
        "owner",
      );

      expect(result?.tax_status).toBe("monotributo");
      expect(result?.government_id).toBe("20123456789");
    });

    it.each([
      { tax_status: "monotributo" },
      { government_id: "12345678" },
      { tax_status: "monotributo", government_id: "20123456789" },
    ])("devuelve null si el cliente no existe al cambiar %p", async (input) => {
      await expect(service.update("missing", input, "owner-1", "owner")).resolves.toBeNull();
      expect(customerRepository.getByIdCalls).toBe(1);
    });

    it.each([{ name: "Maria Gomez" }, { phone: "3411234567" }, { address: "San Martin 123" }])(
      "no consulta el cliente antes de actualizar %p",
      async (input) => {
        customerRepository.customers.push({ ...validCustomer, id: "cus-1" });

        const result = await service.update("cus-1", input, "owner-1", "owner");

        expect(result).toEqual({ ...validCustomer, id: "cus-1", ...input });
        expect(customerRepository.getByIdCalls).toBe(0);
      },
    );
  });

  describe("delete", () => {
    const expires_at = "2026-12-01T00:00:00.000Z";

    // Cliente con carrito; con email, tambien con cuenta web y una sesion abierta.
    async function seedCustomer(name: string, email?: string) {
      const input = email ? { name, email, password: "secreto123" } : { name };
      const { customer } = await service.create(input);
      cartRepository.carts.push({
        id: `cart-${customer.id}`,
        customer_id: customer.id,
        updated_at: expires_at,
        items: [{ id: `item-${customer.id}`, product_id: "p1", quantity: 2 }],
      });
      if (customer.user_id) {
        sessionRepository.sessions.push({
          token: `token-${customer.id}`,
          user_id: customer.user_id,
          expires_at,
        });
      }
      return customer;
    }

    // Otro cliente con cuenta, carrito y sesion: el borrado no lo puede tocar.
    let other: Customer;
    beforeEach(async () => {
      other = await seedCustomer("Otro Cliente", "otro@example.com");
    });

    function expectOtherIntact() {
      expect(customerRepository.customers.map((c) => c.id)).toContain(other.id);
      expect(userRepository.users.map((u) => u.id)).toContain(other.user_id);
      expect(cartRepository.carts.map((c) => c.customer_id)).toContain(other.id);
      expect(sessionRepository.sessions.map((s) => s.user_id)).toContain(other.user_id);
    }

    // Regresion: con pedidos respondia 500 por la clave foranea de orders.customer_id.
    it("con pedidos lanza ConflictError y no borra nada", async () => {
      const customer = await seedCustomer("Maria Gomez", "maria@example.com");
      orderRepository.customerIdsWithOrders.add(customer.id);

      await expect(service.delete(customer.id)).rejects.toThrow(
        new ConflictError("No se puede eliminar un cliente con pedidos registrados"),
      );
      expect(customerRepository.customers).toHaveLength(2);
      expect(userRepository.users).toHaveLength(2);
      expect(cartRepository.carts).toHaveLength(2);
      expect(sessionRepository.sessions).toHaveLength(2);
    });

    // Regresion: se borraba el cliente y quedaba el usuario, que podia entrar sin poder
    // comprar y dejaba el email tomado.
    it("sin pedidos y con cuenta borra carrito, cliente, sesiones y usuario en una transacción", async () => {
      const customer = await seedCustomer("Maria Gomez", "maria@example.com");

      await expect(service.delete(customer.id)).resolves.toBe(true);

      expect(transaction.calls).toBe(1);
      expect(customerRepository.customers.map((c) => c.id)).toEqual([other.id]);
      expect(userRepository.users.map((u) => u.id)).toEqual([other.user_id]);
      expect(cartRepository.carts.map((c) => c.customer_id)).toEqual([other.id]);
      expect(sessionRepository.sessions.map((s) => s.user_id)).toEqual([other.user_id]);
      // El email quedo libre.
      const again = await service.create({ name: "Maria", email: "maria@example.com" });
      expect(again.customer.user_id).not.toBeNull();
    });

    it("un cliente de mostrador sin cuenta: borra carrito y cliente, sin tocar usuarios", async () => {
      const customer = await seedCustomer("Cliente de Local");

      await expect(service.delete(customer.id)).resolves.toBe(true);

      expect(customerRepository.customers.map((c) => c.id)).toEqual([other.id]);
      expect(cartRepository.carts.map((c) => c.customer_id)).toEqual([other.id]);
      expect(userRepository.users).toHaveLength(1);
      expect(sessionRepository.sessions).toHaveLength(1);
    });

    it("devuelve false si el cliente no existe, sin borrar nada", async () => {
      await expect(service.delete("cus-inexistente")).resolves.toBe(false);

      expectOtherIntact();
      expect(cartRepository.carts).toHaveLength(1);
    });

    it("si falla a mitad de camino no queda nada borrado", async () => {
      const customer = await seedCustomer("Maria Gomez", "maria@example.com");
      userRepository.failOnDelete = true;

      await expect(service.delete(customer.id)).rejects.toThrow(
        "fallo simulado al borrar el usuario",
      );

      expect(customerRepository.customers).toHaveLength(2);
      expect(cartRepository.carts).toHaveLength(2);
      expect(sessionRepository.sessions).toHaveLength(2);
      expect(userRepository.users).toHaveLength(2);
      expectOtherIntact();
    });
  });

  describe("getAll", () => {
    it("incluye el email de los clientes con cuenta y null para los de local", async () => {
      await service.create({ name: "Maria Gomez" });
      await service.create({ name: "Carlos Diaz", email: "carlos@example.com" });

      const result = await service.getAll();

      expect(result.map((c) => [c.name, c.email])).toEqual([
        ["Maria Gomez", null],
        ["Carlos Diaz", "carlos@example.com"],
      ]);
      expect(userRepository.getByIdsCalls).toBe(1);
    });
  });

  // El formato valido del documento depende de la condicion fiscal: el consumidor final
  // acepta DNI (7 u 8 digitos) o CUIT/CUIL (11); el resto, solo CUIT.
  describe("government_id segun tax_status", () => {
    const mensajeConsumidorFinal =
      "El documento debe ser un DNI de 7 u 8 dígitos o un CUIT/CUIL de 11";
    const mensajeCuit = "El CUIT debe tener 11 dígitos numéricos";

    it.each([
      ["DNI de 8 dígitos", "30123456"],
      ["DNI de 7 dígitos", "5123456"],
      ["CUIL de 11 dígitos", "20301234561"],
    ])("consumidor final con %s: válido", async (_caso, documento) => {
      const result = await service.create({
        name: "Maria Gomez",
        tax_status: "consumidor_final",
        government_id: documento,
      });

      expect(result.customer.government_id).toBe(documento);
    });

    it("consumidor final con 9 dígitos: inválido", async () => {
      await expect(
        service.create({
          name: "Maria Gomez",
          tax_status: "consumidor_final",
          government_id: "301234567",
        }),
      ).rejects.toThrow(mensajeConsumidorFinal);
      expect(customerRepository.customers).toHaveLength(0);
    });

    // Regresion del orden de validacion: sin tax_status se asume consumidor_final, asi que
    // un DNI tiene que pasar aunque el body no traiga la condicion fiscal.
    it("sin tax_status se valida como consumidor final y acepta un DNI", async () => {
      const result = await service.create({ name: "Maria Gomez", government_id: "30123456" });

      expect(result.customer.tax_status).toBe("consumidor_final");
      expect(result.customer.government_id).toBe("30123456");
    });

    it.each(["responsable_inscripto", "monotributo", "exento"])(
      "%s con DNI de 8 dígitos: inválido",
      async (taxStatus) => {
        await expect(
          service.create({ name: "Empresa SA", tax_status: taxStatus, government_id: "30123456" }),
        ).rejects.toThrow(mensajeCuit);
        expect(customerRepository.customers).toHaveLength(0);
      },
    );

    it("responsable inscripto con CUIT de 11 dígitos: válido", async () => {
      const result = await service.create({
        name: "Empresa SA",
        tax_status: "responsable_inscripto",
        government_id: "30712345678",
      });

      expect(result.customer.government_id).toBe("30712345678");
    });

    it.each(["consumidor_final", "responsable_inscripto", "monotributo", "exento"])(
      "campo vacío con %s: válido, queda null",
      async (taxStatus) => {
        for (const vacio of ["", "   ", null]) {
          const result = await service.create({
            name: "Cliente",
            tax_status: taxStatus,
            government_id: vacio,
          });
          expect(result.customer.government_id).toBeNull();
        }
      },
    );

    describe("update", () => {
      // Cliente ya guardado; cada test elige su condicion fiscal y documento.
      function seed(data: Partial<Customer>): Customer {
        const customer: Customer = { ...validCustomer, id: "cus-1", user_id: "user-1", ...data };
        customerRepository.customers.push(customer);
        return customer;
      }

      it("si solo llega government_id, valida contra el tax_status guardado", async () => {
        seed({ tax_status: "responsable_inscripto", government_id: "30712345678" });

        await expect(
          service.update("cus-1", { government_id: "30123456" }, "user-owner", "owner"),
        ).rejects.toThrow(mensajeCuit);
        expect(customerRepository.customers[0]!.government_id).toBe("30712345678");

        const updated = await service.update(
          "cus-1",
          { government_id: "30799999999" },
          "user-owner",
          "owner",
        );
        expect(updated?.government_id).toBe("30799999999");
        expect(updated?.tax_status).toBe("responsable_inscripto");
      });

      it("un consumidor final guardado puede cambiar su documento a un DNI", async () => {
        seed({ tax_status: "consumidor_final", government_id: null });

        const updated = await service.update(
          "cus-1",
          { government_id: "5123456" },
          "user-owner",
          "owner",
        );

        expect(updated?.government_id).toBe("5123456");
      });

      // Pasar a responsable inscripto con un DNI cargado dejaria un documento invalido.
      it("si solo llega tax_status, revalida el documento guardado", async () => {
        seed({ tax_status: "consumidor_final", government_id: "30123456" });

        await expect(
          service.update("cus-1", { tax_status: "responsable_inscripto" }, "user-owner", "owner"),
        ).rejects.toThrow(mensajeCuit);
        expect(customerRepository.customers[0]!.tax_status).toBe("consumidor_final");

        const updated = await service.update(
          "cus-1",
          { tax_status: "responsable_inscripto", government_id: "30712345678" },
          "user-owner",
          "owner",
        );
        expect(updated?.tax_status).toBe("responsable_inscripto");
        expect(updated?.government_id).toBe("30712345678");
      });

      it("el cliente que edita su propio perfil valida contra su tax_status guardado", async () => {
        seed({ tax_status: "monotributo", government_id: null });

        await expect(
          service.update("cus-1", { government_id: "30123456" }, "user-1", "cliente"),
        ).rejects.toThrow(mensajeCuit);
      });

      it("devuelve null si el cliente no existe", async () => {
        expect(
          await service.update(
            "cus-inexistente",
            { government_id: "30123456" },
            "user-owner",
            "owner",
          ),
        ).toBeNull();
      });
    });
  });
});
