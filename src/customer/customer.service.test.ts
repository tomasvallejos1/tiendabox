import { describe, it, expect, beforeEach } from "vitest";
import { CustomerService } from "./customer.service";
import { Customer } from "./customer.entity";
import { ICustomerRepository } from "./customer.repository.interface";
import { User } from "../user/user.entity";
import { IUserRepository } from "../user/user.repository.interface";
import { ConflictError } from "../errors";

// Fake en memoria de ICustomerRepository. failOnCreate simula una caida de la base
// justo al insertar el cliente.
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

  async getByUserId(): Promise<Customer | null> {
    throw new Error("no usado en estos tests");
  }

  async getAll(): Promise<Customer[]> {
    return this.customers;
  }

  async update(): Promise<Customer | null> {
    throw new Error("no usado en estos tests");
  }

  async delete(): Promise<boolean> {
    throw new Error("no usado en estos tests");
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

  async getById(): Promise<User | null> {
    throw new Error("no usado en estos tests");
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

  async delete(id: string): Promise<boolean> {
    const index = this.users.findIndex((user) => user.id === id);
    if (index === -1) return false;
    this.users.splice(index, 1);
    return true;
  }
}

describe("CustomerService", () => {
  let customerRepository: FakeCustomerRepository;
  let userRepository: FakeUserRepository;
  let service: CustomerService;

  beforeEach(() => {
    customerRepository = new FakeCustomerRepository();
    userRepository = new FakeUserRepository();
    service = new CustomerService(customerRepository, userRepository);
  });

  describe("create", () => {
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
});
