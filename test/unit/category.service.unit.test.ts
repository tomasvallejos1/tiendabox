import { CategoryService } from "../../src/category/category.service";
import { Category } from "../../src/category/category.entity";
import { ICategoryRepository } from "../../src/category/category.repository.interface";
import { ConflictError, ValidationError } from "../../src/errors";
import { validCategory } from "../fixtures";

// Fake en memoria de ICategoryRepository. getByName replica la collation strength 2 del repo
// de Mongo: no distingue mayusculas. La insensibilidad la pone el repo, no el service; el
// service solo decide que hacer con lo que el repo encuentra.
class FakeCategoryRepository implements ICategoryRepository {
  readonly categories: Category[] = [];

  async create(data: Omit<Category, "id">): Promise<Category> {
    const category: Category = { id: `cat-${this.categories.length + 1}`, ...data };
    this.categories.push(category);
    return { ...category };
  }

  async getById(id: string): Promise<Category | null> {
    const category = this.categories.find((c) => c.id === id);
    return category ? { ...category } : null;
  }

  async getByName(name: string): Promise<Category | null> {
    const category = this.categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
    return category ? { ...category } : null;
  }

  async getAll(): Promise<Category[]> {
    return this.categories.map((category) => ({ ...category }));
  }

  async update(id: string, data: Partial<Omit<Category, "id">>): Promise<Category | null> {
    const category = this.categories.find((c) => c.id === id);
    if (!category) return null;
    Object.assign(category, data);
    return { ...category };
  }

  async delete(id: string): Promise<boolean> {
    const index = this.categories.findIndex((c) => c.id === id);
    if (index === -1) return false;
    this.categories.splice(index, 1);
    return true;
  }

  async createIndexes(): Promise<void> {
    throw new Error("no usado en estos tests");
  }
}

describe("CategoryService", () => {
  let repository: FakeCategoryRepository;
  let service: CategoryService;

  beforeEach(() => {
    repository = new FakeCategoryRepository();
    service = new CategoryService(repository);
  });

  describe("create", () => {
    it("guarda la categoría y la devuelve", async () => {
      const result = await service.create(validCategory);

      expect(result).toEqual({ ...validCategory, id: repository.categories[0]!.id });
      expect(repository.categories).toHaveLength(1);
    });

    it("guarda el nombre sin los espacios de los extremos", async () => {
      const result = await service.create({ ...validCategory, name: "  Notebooks  " });

      expect(result.name).toBe("Notebooks");
    });

    it("sin descripción guarda null", async () => {
      const result = await service.create({ name: "Monitores" });

      expect(result.description).toBeNull();
    });

    it.each([
      ["ausente", undefined],
      ["vacío", ""],
      ["con solo espacios", "   "],
      ["que no es texto", 123],
    ])("rechaza un nombre %s", async (_caso, name) => {
      await expect(service.create({ ...validCategory, name })).rejects.toThrow(
        new ValidationError("El campo 'name' es obligatorio"),
      );
      expect(repository.categories).toHaveLength(0);
    });

    it("acepta un nombre de 100 caracteres y rechaza uno de 101", async () => {
      await expect(service.create({ name: "a".repeat(100) })).resolves.toMatchObject({
        name: "a".repeat(100),
      });

      await expect(service.create({ name: "b".repeat(101) })).rejects.toThrow(
        new ValidationError("El campo 'name' no puede superar los 100 caracteres"),
      );
      expect(repository.categories).toHaveLength(1);
    });

    // El limite se mide sobre el nombre ya recortado: los espacios de los extremos no cuentan.
    it("mide el máximo sobre el nombre sin espacios en los extremos", async () => {
      await expect(service.create({ name: ` ${"a".repeat(100)} ` })).resolves.toBeDefined();
    });

    it("rechaza una descripción que no es texto", async () => {
      await expect(service.create({ ...validCategory, description: 42 })).rejects.toThrow(
        new ValidationError("El campo 'description' debe ser texto"),
      );
    });

    it("rechaza con ConflictError un nombre duplicado", async () => {
      await service.create(validCategory);

      await expect(service.create(validCategory)).rejects.toThrow(
        new ConflictError("Ya existe una categoria con el nombre 'Notebooks'"),
      );
      expect(repository.categories).toHaveLength(1);
    });

    // La comparacion sin mayusculas la resuelve getByName en el repo (probada en los tests
    // de integracion). Lo que le toca al service es consultar con el nombre ya recortado y
    // rechazar cualquier coincidencia que el repo devuelva.
    it("consulta el duplicado con el nombre recortado y rechaza la coincidencia del repo", async () => {
      await service.create(validCategory);
      const getByName = jest.spyOn(repository, "getByName");

      await expect(service.create({ name: "  NOTEBOOKS " })).rejects.toThrow(ConflictError);
      expect(getByName).toHaveBeenCalledWith("NOTEBOOKS");
      expect(repository.categories).toHaveLength(1);
    });
  });

  describe("update", () => {
    let id: string;

    beforeEach(async () => {
      ({ id } = await service.create(validCategory));
    });

    it("modifica solo los campos enviados", async () => {
      const result = await service.update(id, { description: null });

      expect(result).toEqual({ id, name: validCategory.name, description: null });
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

    it("valida el nombre igual que create", async () => {
      await expect(service.update(id, { name: "   " })).rejects.toThrow(ValidationError);
      expect(repository.categories[0]!.name).toBe(validCategory.name);
    });

    it("permite conservar el propio nombre", async () => {
      await expect(service.update(id, { name: "NOTEBOOKS" })).resolves.toMatchObject({
        name: "NOTEBOOKS",
      });
    });

    it("rechaza con ConflictError el nombre de otra categoría", async () => {
      await service.create({ name: "Monitores" });

      await expect(service.update(id, { name: "monitores" })).rejects.toThrow(ConflictError);
      expect(repository.categories[0]!.name).toBe(validCategory.name);
    });

    it("devuelve null si la categoría no existe", async () => {
      await expect(service.update("no-existe", { name: "Tablets" })).resolves.toBeNull();
    });
  });

  describe("delete", () => {
    it("delega en el repositorio y propaga su resultado", async () => {
      const { id } = await service.create(validCategory);
      const remove = jest.spyOn(repository, "delete");

      await expect(service.delete(id)).resolves.toBe(true);
      await expect(service.delete(id)).resolves.toBe(false);
      expect(remove).toHaveBeenNthCalledWith(1, id);
      expect(remove).toHaveBeenNthCalledWith(2, id);
    });
  });

  describe("lecturas", () => {
    it("getAll y getById devuelven lo que tiene el repositorio", async () => {
      const created = await service.create(validCategory);

      await expect(service.getAll()).resolves.toEqual([created]);
      await expect(service.getById(created.id)).resolves.toEqual(created);
      await expect(service.getById("no-existe")).resolves.toBeNull();
    });
  });
});
