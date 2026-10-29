import { BrandService } from "../../src/brand/brand.service";
import { Brand } from "../../src/brand/brand.entity";
import { IBrandRepository } from "../../src/brand/brand.repository.interface";
import { ConflictError, ValidationError } from "../../src/errors";
import { validBrand } from "../fixtures";

// Fake en memoria de IBrandRepository. getByName replica la collation strength 2 del repo de
// Mongo: no distingue mayusculas. La insensibilidad la pone el repo, no el service; el
// service solo decide que hacer con lo que el repo encuentra.
class FakeBrandRepository implements IBrandRepository {
  readonly brands: Brand[] = [];

  async create(data: Omit<Brand, "id">): Promise<Brand> {
    const brand: Brand = { id: `brand-${this.brands.length + 1}`, ...data };
    this.brands.push(brand);
    return { ...brand };
  }

  async getById(id: string): Promise<Brand | null> {
    const brand = this.brands.find((b) => b.id === id);
    return brand ? { ...brand } : null;
  }

  async getByName(name: string): Promise<Brand | null> {
    const brand = this.brands.find((b) => b.name.toLowerCase() === name.toLowerCase());
    return brand ? { ...brand } : null;
  }

  async getAll(): Promise<Brand[]> {
    return this.brands.map((brand) => ({ ...brand }));
  }

  async update(id: string, data: Partial<Omit<Brand, "id">>): Promise<Brand | null> {
    const brand = this.brands.find((b) => b.id === id);
    if (!brand) return null;
    Object.assign(brand, data);
    return { ...brand };
  }

  async delete(id: string): Promise<boolean> {
    const index = this.brands.findIndex((b) => b.id === id);
    if (index === -1) return false;
    this.brands.splice(index, 1);
    return true;
  }
}

describe("BrandService", () => {
  let repository: FakeBrandRepository;
  let service: BrandService;

  beforeEach(() => {
    repository = new FakeBrandRepository();
    service = new BrandService(repository);
  });

  describe("create", () => {
    it("guarda la marca y la devuelve", async () => {
      const result = await service.create(validBrand);

      expect(result).toEqual({ ...validBrand, id: repository.brands[0]!.id });
      expect(repository.brands).toHaveLength(1);
    });

    it("guarda el nombre sin los espacios de los extremos", async () => {
      const result = await service.create({ ...validBrand, name: "  Lenovo  " });

      expect(result.name).toBe("Lenovo");
    });

    it("sin logo_url guarda null", async () => {
      const result = await service.create({ name: "Genérica" });

      expect(result.logo_url).toBeNull();
    });

    it.each([
      ["ausente", undefined],
      ["vacío", ""],
      ["con solo espacios", "   "],
      ["que no es texto", 123],
    ])("rechaza un nombre %s", async (_caso, name) => {
      await expect(service.create({ ...validBrand, name })).rejects.toThrow(
        new ValidationError("El campo 'name' es obligatorio"),
      );
      expect(repository.brands).toHaveLength(0);
    });

    it("acepta un nombre de 100 caracteres y rechaza uno de 101", async () => {
      await expect(service.create({ name: "a".repeat(100) })).resolves.toMatchObject({
        name: "a".repeat(100),
      });

      await expect(service.create({ name: "b".repeat(101) })).rejects.toThrow(
        new ValidationError("El campo 'name' no puede superar los 100 caracteres"),
      );
      expect(repository.brands).toHaveLength(1);
    });

    // El limite se mide sobre el nombre ya recortado: los espacios de los extremos no cuentan.
    it("mide el máximo sobre el nombre sin espacios en los extremos", async () => {
      await expect(service.create({ name: ` ${"a".repeat(100)} ` })).resolves.toBeDefined();
    });

    it("rechaza un logo_url que no es texto", async () => {
      await expect(service.create({ ...validBrand, logo_url: 42 })).rejects.toThrow(
        new ValidationError("El campo 'logo_url' debe ser texto"),
      );
    });

    it("rechaza con ConflictError un nombre duplicado", async () => {
      await service.create(validBrand);

      await expect(service.create(validBrand)).rejects.toThrow(
        new ConflictError("Ya existe una marca con el nombre 'Lenovo'"),
      );
      expect(repository.brands).toHaveLength(1);
    });

    // La comparacion sin mayusculas la resuelve getByName en el repo (probada en los tests
    // de integracion). Lo que le toca al service es consultar con el nombre ya recortado y
    // rechazar cualquier coincidencia que el repo devuelva.
    it("consulta el duplicado con el nombre recortado y rechaza la coincidencia del repo", async () => {
      await service.create(validBrand);
      const getByName = jest.spyOn(repository, "getByName");

      await expect(service.create({ name: "  LENOVO " })).rejects.toThrow(ConflictError);
      expect(getByName).toHaveBeenCalledWith("LENOVO");
      expect(repository.brands).toHaveLength(1);
    });
  });

  describe("update", () => {
    let id: string;

    beforeEach(async () => {
      ({ id } = await service.create(validBrand));
    });

    it("modifica solo los campos enviados", async () => {
      const result = await service.update(id, { logo_url: null });

      expect(result).toEqual({ id, name: validBrand.name, logo_url: null });
    });

    it.each<Record<string, unknown>>([{}, { otro_campo: "x" }])(
      "con body sin campos editables (%p) lanza ValidationError sin tocar el repo",
      async (body) => {
        const update = jest.spyOn(repository, "update");

        await expect(service.update(id, body)).rejects.toThrow(
          new ValidationError("El body no puede estar vacío"),
        );
        expect(update).not.toHaveBeenCalled();
      },
    );

    it("valida el nombre igual que create", async () => {
      await expect(service.update(id, { name: "   " })).rejects.toThrow(ValidationError);
      expect(repository.brands[0]!.name).toBe(validBrand.name);
    });

    it("permite conservar el propio nombre", async () => {
      await expect(service.update(id, { name: "LENOVO" })).resolves.toMatchObject({
        name: "LENOVO",
      });
    });

    it("rechaza con ConflictError el nombre de otra marca", async () => {
      await service.create({ name: "Logitech" });

      await expect(service.update(id, { name: "logitech" })).rejects.toThrow(ConflictError);
      expect(repository.brands[0]!.name).toBe(validBrand.name);
    });

    it("devuelve null si la marca no existe", async () => {
      await expect(service.update("no-existe", { name: "Samsung" })).resolves.toBeNull();
    });
  });

  describe("delete", () => {
    it("delega en el repositorio y propaga su resultado", async () => {
      const { id } = await service.create(validBrand);
      const remove = jest.spyOn(repository, "delete");

      await expect(service.delete(id)).resolves.toBe(true);
      await expect(service.delete(id)).resolves.toBe(false);
      expect(remove).toHaveBeenNthCalledWith(1, id);
      expect(remove).toHaveBeenNthCalledWith(2, id);
    });
  });

  describe("lecturas", () => {
    it("getAll y getById devuelven lo que tiene el repositorio", async () => {
      const created = await service.create(validBrand);

      await expect(service.getAll()).resolves.toEqual([created]);
      await expect(service.getById(created.id)).resolves.toEqual(created);
      await expect(service.getById("no-existe")).resolves.toBeNull();
    });
  });
});
