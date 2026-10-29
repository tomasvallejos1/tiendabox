import { UserService } from "../../src/user/user.service";
import { User } from "../../src/user/user.entity";
import { IUserRepository } from "../../src/user/user.repository.interface";
import { ConflictError, ValidationError } from "../../src/errors";
import { validUser } from "../fixtures";

// Fake en memoria de IUserRepository. Guarda el password como la base real, asi se puede
// verificar que el service lo descarta al devolver. getByEmail replica el LOWER(email) de
// Postgres.
class FakeUserRepository implements IUserRepository {
  readonly users: User[] = [];

  async create(data: Omit<User, "id" | "created_at">): Promise<User> {
    const user: User = {
      id: `user-${this.users.length + 1}`,
      created_at: "2026-01-01 00:00:00",
      ...data,
    };
    this.users.push(user);
    return { ...user };
  }

  async getById(id: string): Promise<User | null> {
    const user = this.users.find((u) => u.id === id);
    return user ? { ...user } : null;
  }

  async getByIds(): Promise<User[]> {
    throw new Error("no usado en estos tests");
  }

  async getByEmail(email: string): Promise<User | null> {
    const user = this.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    return user ? { ...user } : null;
  }

  async getAll(): Promise<User[]> {
    return this.users.map((user) => ({ ...user }));
  }

  async update(id: string, data: Partial<Omit<User, "id" | "created_at">>): Promise<User | null> {
    const user = this.users.find((u) => u.id === id);
    if (!user) return null;
    Object.assign(user, data);
    return { ...user };
  }

  async delete(id: string): Promise<boolean> {
    const index = this.users.findIndex((u) => u.id === id);
    if (index === -1) return false;
    this.users.splice(index, 1);
    return true;
  }
}

// Revisa el objeto COMPLETO, a cualquier profundidad: ni la clave "password" ni su valor
// pueden salir del service.
function expectNoPassword(value: unknown, password: string): void {
  const json = JSON.stringify(value);
  expect(json).not.toContain('"password"');
  expect(json).not.toContain(password);
}

describe("UserService", () => {
  let repository: FakeUserRepository;
  let service: UserService;

  beforeEach(() => {
    repository = new FakeUserRepository();
    service = new UserService(repository);
  });

  describe("create", () => {
    it("guarda el usuario y devuelve su versión pública", async () => {
      const result = await service.create(validUser);

      expect(repository.users[0]).toMatchObject(validUser);
      expect(result).toEqual({
        id: repository.users[0]!.id,
        email: validUser.email,
        role: "cliente",
        created_at: repository.users[0]!.created_at,
      });
      expectNoPassword(result, validUser.password);
    });

    it.each([
      ["email ausente", { email: undefined }, "El campo 'email' es obligatorio"],
      ["email en blanco", { email: "   " }, "El campo 'email' es obligatorio"],
      [
        "email sin arroba",
        { email: "cliente.example.com" },
        "El campo 'email' debe ser un email valido",
      ],
      ["password ausente", { password: undefined }, "El campo 'password' es obligatorio"],
      [
        "password de 5 caracteres",
        { password: "12345" },
        "El campo 'password' debe tener al menos 6 caracteres",
      ],
    ])("rechaza con ValidationError: %s, sin crear nada", async (_caso, override, message) => {
      await expect(service.create({ ...validUser, ...override })).rejects.toThrow(
        new ValidationError(message),
      );
      expect(repository.users).toHaveLength(0);
    });

    it("acepta un password de exactamente 6 caracteres", async () => {
      await service.create({ ...validUser, password: "123456" });

      expect(repository.users).toHaveLength(1);
    });

    it("rechaza con ConflictError un email ya usado, sin importar mayúsculas", async () => {
      await service.create(validUser);

      await expect(
        service.create({ ...validUser, email: validUser.email.toUpperCase() }),
      ).rejects.toThrow(new ConflictError("Ya existe un usuario con ese email"));
      expect(repository.users).toHaveLength(1);
    });

    it.each([undefined, null])("sin role (%s) crea un usuario con rol cliente", async (role) => {
      const result = await service.create({ ...validUser, role });

      expect(result.role).toBe("cliente");
    });

    it.each(["cliente", "owner"])("acepta el rol %s", async (role) => {
      const result = await service.create({ ...validUser, role });

      expect(result.role).toBe(role);
    });

    it.each(["admin", "Owner", "", 1])("rechaza el rol %p", async (role) => {
      await expect(service.create({ ...validUser, role })).rejects.toThrow(
        new ValidationError("El campo 'role' debe ser 'cliente' o 'owner'"),
      );
      expect(repository.users).toHaveLength(0);
    });
  });

  describe("lecturas sin password", () => {
    it("getAll nunca devuelve el password de ningún usuario", async () => {
      await service.create(validUser);
      await service.create({ email: "owner@example.com", password: "clave-owner", role: "owner" });

      const result = await service.getAll();

      expect(result).toHaveLength(2);
      expectNoPassword(result, validUser.password);
      expectNoPassword(result, "clave-owner");
      expect(result.map((user) => Object.keys(user).sort())).toEqual([
        ["created_at", "email", "id", "role"],
        ["created_at", "email", "id", "role"],
      ]);
    });

    it("getById nunca devuelve el password", async () => {
      const { id } = await service.create(validUser);

      const result = await service.getById(id);

      expect(result).toEqual({
        id,
        email: validUser.email,
        role: "cliente",
        created_at: repository.users[0]!.created_at,
      });
      expectNoPassword(result, validUser.password);
    });

    it("getById devuelve null si el usuario no existe", async () => {
      await expect(service.getById("no-existe")).resolves.toBeNull();
    });
  });

  describe("update", () => {
    let id: string;

    beforeEach(async () => {
      ({ id } = await service.create(validUser));
    });

    it("si no viene password, no lo toca", async () => {
      await service.update(id, { role: "owner" });

      expect(repository.users[0]).toMatchObject({ role: "owner", password: validUser.password });
    });

    it("cambia el password cuando viene, validando el mínimo de caracteres", async () => {
      await expect(service.update(id, { password: "corta" })).rejects.toThrow(ValidationError);
      expect(repository.users[0]!.password).toBe(validUser.password);

      const result = await service.update(id, { password: "nueva-clave" });

      expect(repository.users[0]!.password).toBe("nueva-clave");
      expectNoPassword(result, "nueva-clave");
    });

    it.each<Record<string, unknown>>([{}, { otro_campo: "x" }])(
      "con body sin campos editables (%p) lanza ValidationError sin tocar el repo",
      async (body) => {
        const update = jest.spyOn(repository, "update");

        await expect(service.update(id, body)).rejects.toThrow(
          new ValidationError("El body no puede estar vacio"),
        );
        expect(update).not.toHaveBeenCalled();
      },
    );

    it("permite conservar el propio email, aunque cambie de mayúsculas", async () => {
      const result = await service.update(id, { email: validUser.email.toUpperCase() });

      expect(result?.email).toBe(validUser.email.toUpperCase());
    });

    it("rechaza con ConflictError el email de otro usuario", async () => {
      await service.create({ ...validUser, email: "otro@example.com" });

      await expect(service.update(id, { email: "otro@example.com" })).rejects.toThrow(
        ConflictError,
      );
      expect(repository.users[0]!.email).toBe(validUser.email);
    });

    it("rechaza un rol inválido", async () => {
      await expect(service.update(id, { role: "admin" })).rejects.toThrow(ValidationError);
      expect(repository.users[0]!.role).toBe("cliente");
    });

    it("devuelve null si el usuario no existe", async () => {
      await expect(service.update("no-existe", { role: "owner" })).resolves.toBeNull();
    });
  });

  describe("delete", () => {
    it("delega en el repositorio y propaga su resultado", async () => {
      const { id } = await service.create(validUser);

      await expect(service.delete(id)).resolves.toBe(true);
      await expect(service.delete(id)).resolves.toBe(false);
      expect(repository.users).toHaveLength(0);
    });
  });
});
