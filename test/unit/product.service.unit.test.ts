import { ProductService } from "../../src/product/product.service";
import { Product } from "../../src/product/product.entity";
import { IProductRepository, ProductFilter } from "../../src/product/product.repository.interface";
import { ICategoryRepository } from "../../src/category/category.repository.interface";
import { IBrandRepository } from "../../src/brand/brand.repository.interface";
import { Category } from "../../src/category/category.entity";
import { Brand } from "../../src/brand/brand.entity";
import { ValidationError } from "../../src/errors";
import { validBrand, validCategory, validProduct } from "../fixtures";

// Fake en memoria de IProductRepository. getAll replica la semantica del repo
// real de Mongo: siempre filtra is_active === true y aplica category_id/brand_id si vienen.
class FakeProductRepository implements IProductRepository {
  constructor(private readonly products: Product[]) {}

  async create(data: Omit<Product, "id">): Promise<Product> {
    return { id: "nuevo", ...data };
  }

  async getById(id: string): Promise<Product | null> {
    const product = this.products.find((p) => p.id === id && p.is_active);
    return product ? { ...product } : null;
  }

  async getByIds(): Promise<Product[]> {
    throw new Error("no usado en estos tests");
  }

  async getAll(filter?: ProductFilter): Promise<Product[]> {
    return this.products.filter((product) => {
      if (!product.is_active) return false;
      if (filter?.category_id && product.category_id !== filter.category_id) return false;
      if (filter?.brand_id && product.brand_id !== filter.brand_id) return false;
      return true;
    });
  }

  async update(id: string, data: Partial<Omit<Product, "id">>): Promise<Product | null> {
    const product = this.products.find((p) => p.id === id && p.is_active);
    if (!product) return null;
    Object.assign(product, data);
    return { ...product };
  }

  async softDelete(): Promise<boolean> {
    throw new Error("no usado en estos tests");
  }

  async decrementStock(): Promise<boolean> {
    throw new Error("no usado en estos tests");
  }

  async incrementStock(): Promise<void> {
    throw new Error("no usado en estos tests");
  }

  async countActiveByCategory(): Promise<number> {
    throw new Error("no usado en estos tests");
  }

  async countActiveByBrand(): Promise<number> {
    throw new Error("no usado en estos tests");
  }
}

// Fakes de category y brand: solo getById, que es lo que usa ProductService para verificar
// que las referencias del producto existan.
class FakeCategoryRepository implements ICategoryRepository {
  constructor(private readonly categories: Category[]) {}

  async getById(id: string): Promise<Category | null> {
    return this.categories.find((category) => category.id === id) ?? null;
  }

  async create(): Promise<Category> {
    throw new Error("no usado en estos tests");
  }

  async getByName(): Promise<Category | null> {
    throw new Error("no usado en estos tests");
  }

  async getAll(): Promise<Category[]> {
    throw new Error("no usado en estos tests");
  }

  async update(): Promise<Category | null> {
    throw new Error("no usado en estos tests");
  }

  async delete(): Promise<boolean> {
    throw new Error("no usado en estos tests");
  }

  async createIndexes(): Promise<void> {
    throw new Error("no usado en estos tests");
  }
}

class FakeBrandRepository implements IBrandRepository {
  constructor(private readonly brands: Brand[]) {}

  async getById(id: string): Promise<Brand | null> {
    return this.brands.find((brand) => brand.id === id) ?? null;
  }

  async create(): Promise<Brand> {
    throw new Error("no usado en estos tests");
  }

  async getByName(): Promise<Brand | null> {
    throw new Error("no usado en estos tests");
  }

  async getAll(): Promise<Brand[]> {
    throw new Error("no usado en estos tests");
  }

  async update(): Promise<Brand | null> {
    throw new Error("no usado en estos tests");
  }

  async delete(): Promise<boolean> {
    throw new Error("no usado en estos tests");
  }
}

// Existen la categoria cat-1 y la marca brand-1, las de validProduct.
function createCatalogRepositories() {
  return {
    categoryRepository: new FakeCategoryRepository([{ ...validCategory, id: "cat-1" }]),
    brandRepository: new FakeBrandRepository([{ ...validBrand, id: "brand-1" }]),
  };
}

describe("ProductService.getAll (filtros)", () => {
  let service: ProductService;

  // Dataset: combinaciones de categoria/marca + un inactivo que nunca debe aparecer.
  const products: Product[] = [
    { ...validProduct, id: "1", category_id: "cat-1", brand_id: "brand-1" },
    { ...validProduct, id: "2", category_id: "cat-1", brand_id: "brand-2" },
    { ...validProduct, id: "3", category_id: "cat-2", brand_id: "brand-1" },
    { ...validProduct, id: "4", category_id: "cat-2", brand_id: "brand-2" },
    { ...validProduct, id: "5", category_id: "cat-1", brand_id: "brand-1", is_active: false },
  ];

  beforeEach(() => {
    const repository = new FakeProductRepository(products);
    const { categoryRepository, brandRepository } = createCatalogRepositories();
    service = new ProductService(repository, categoryRepository, brandRepository);
  });

  it("sin filtros devuelve todos los productos activos", async () => {
    const result = await service.getAll();
    expect(result.map((p) => p.id)).toEqual(["1", "2", "3", "4"]);
  });

  it("filtra solo por category_id", async () => {
    const result = await service.getAll({ category_id: "cat-1" });
    expect(result.map((p) => p.id)).toEqual(["1", "2"]);
    expect(result.every((p) => p.category_id === "cat-1")).toBe(true);
  });

  it("filtra solo por brand_id", async () => {
    const result = await service.getAll({ brand_id: "brand-1" });
    expect(result.map((p) => p.id)).toEqual(["1", "3"]);
    expect(result.every((p) => p.brand_id === "brand-1")).toBe(true);
  });

  it("aplica category_id y brand_id a la vez", async () => {
    const result = await service.getAll({ category_id: "cat-2", brand_id: "brand-1" });
    expect(result.map((p) => p.id)).toEqual(["3"]);
  });

  it("devuelve un array vacio cuando el filtro no matchea nada", async () => {
    const result = await service.getAll({ category_id: "cat-inexistente" });
    expect(result).toEqual([]);
  });

  it("nunca incluye productos con is_active:false, con o sin filtro", async () => {
    const sinFiltro = await service.getAll();
    expect(sinFiltro.some((p) => p.id === "5")).toBe(false);

    const conFiltro = await service.getAll({ category_id: "cat-1", brand_id: "brand-1" });
    expect(conFiltro.map((p) => p.id)).toEqual(["1"]);
    expect(conFiltro.some((p) => p.id === "5")).toBe(false);
  });
});

describe("ProductService.create (image_url)", () => {
  let service: ProductService;

  // Body minimo valido; cada test le suma su image_url.
  const baseInput = {
    name: "Macbook Pro 14",
    type: "stock",
    price: 100,
    stock: 10,
    category_id: "cat-1",
    brand_id: "brand-1",
  };

  beforeEach(() => {
    const repository = new FakeProductRepository([]);
    const { categoryRepository, brandRepository } = createCatalogRepositories();
    service = new ProductService(repository, categoryRepository, brandRepository);
  });

  it("guarda la URL cuando empieza con http:// o https://", async () => {
    const https = await service.create({ ...baseInput, image_url: "https://example.com/a.jpg" });
    expect(https.image_url).toBe("https://example.com/a.jpg");

    const http = await service.create({ ...baseInput, image_url: "http://example.com/a.jpg" });
    expect(http.image_url).toBe("http://example.com/a.jpg");
  });

  it("queda en null si no viene", async () => {
    const result = await service.create(baseInput);
    expect(result.image_url).toBeNull();
  });

  it("normaliza el string vacio a null", async () => {
    const result = await service.create({ ...baseInput, image_url: "" });
    expect(result.image_url).toBeNull();
  });

  it("rechaza valores que no son un enlace http(s)", async () => {
    const mensaje = "La URL de la imagen debe comenzar con http:// o https://";
    await expect(service.create({ ...baseInput, image_url: "ftp://x/a.jpg" })).rejects.toThrow(
      mensaje,
    );
    await expect(service.create({ ...baseInput, image_url: 123 })).rejects.toThrow(mensaje);
  });
});

describe("ProductService.create (referencias y stock)", () => {
  let service: ProductService;
  let create: jest.SpyInstance;

  const baseInput = {
    name: "Macbook Pro 14",
    type: "stock",
    price: 100,
    stock: 10,
    category_id: "cat-1",
    brand_id: "brand-1",
  };

  beforeEach(() => {
    const repository = new FakeProductRepository([]);
    create = jest.spyOn(repository, "create");
    const { categoryRepository, brandRepository } = createCatalogRepositories();
    service = new ProductService(repository, categoryRepository, brandRepository);
  });

  // Regresion: category_id "x", brand_id "y" y stock 1.5 respondian 201.
  it.each([
    [{ category_id: "x" }, "La categoría indicada no existe"],
    [{ brand_id: "y" }, "La marca indicada no existe"],
    [{ stock: 1.5 }, "El campo 'stock' debe ser un número entero mayor o igual a 0"],
    [{ stock: -1 }, "El campo 'stock' debe ser un número entero mayor o igual a 0"],
    [{ category_id: { $ne: null } }, "El campo 'category_id' es obligatorio"],
    [{ brand_id: { $gt: "" } }, "El campo 'brand_id' es obligatorio"],
  ])("rechaza %p sin crear el producto", async (override, mensaje) => {
    await expect(service.create({ ...baseInput, ...override })).rejects.toThrow(
      new ValidationError(mensaje),
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("acepta un precio con decimales y guarda las referencias sin espacios", async () => {
    const product = await service.create({
      ...baseInput,
      price: 1234.56,
      category_id: " cat-1 ",
      brand_id: " brand-1 ",
    });

    expect(product.price).toBe(1234.56);
    expect(product.category_id).toBe("cat-1");
    expect(product.brand_id).toBe("brand-1");
  });
});

describe("ProductService.update (referencias y stock)", () => {
  let service: ProductService;
  let categoryGetById: jest.SpyInstance;
  let brandGetById: jest.SpyInstance;

  beforeEach(() => {
    const repository = new FakeProductRepository([{ ...validProduct, id: "p1" }]);
    const { categoryRepository, brandRepository } = createCatalogRepositories();
    categoryGetById = jest.spyOn(categoryRepository, "getById");
    brandGetById = jest.spyOn(brandRepository, "getById");
    service = new ProductService(repository, categoryRepository, brandRepository);
  });

  it("si solo cambia el nombre no consulta categoria ni marca", async () => {
    const updated = await service.update("p1", { name: "Nuevo nombre" });

    expect(updated?.name).toBe("Nuevo nombre");
    expect(categoryGetById).not.toHaveBeenCalled();
    expect(brandGetById).not.toHaveBeenCalled();
  });

  it("valida solo la referencia que viene en el body", async () => {
    await expect(service.update("p1", { category_id: "x" })).rejects.toThrow(
      new ValidationError("La categoría indicada no existe"),
    );
    expect(categoryGetById).toHaveBeenCalledWith("x");
    expect(brandGetById).not.toHaveBeenCalled();

    await expect(service.update("p1", { brand_id: "y" })).rejects.toThrow(
      new ValidationError("La marca indicada no existe"),
    );
  });

  it("acepta una categoria y una marca existentes", async () => {
    const updated = await service.update("p1", { category_id: "cat-1", brand_id: "brand-1" });

    expect(updated).toMatchObject({ category_id: "cat-1", brand_id: "brand-1" });
  });

  it("rechaza un stock decimal sin modificar el producto", async () => {
    await expect(service.update("p1", { stock: 2.5 })).rejects.toThrow(
      new ValidationError("El campo 'stock' debe ser un número entero mayor o igual a 0"),
    );
    expect((await service.getById("p1"))?.stock).toBe(10);
  });
});
