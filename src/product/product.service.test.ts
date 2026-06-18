import { describe, it, expect, beforeEach } from "vitest";
import { ProductService } from "./product.service";
import { Product } from "./product.entity";
import { IProductRepository, ProductFilter } from "./product.repository.interface";
import { ICategoryRepository } from "../category/category.repository.interface";
import { IBrandRepository } from "../brand/brand.repository.interface";

// Fake en memoria de IProductRepository. getAll replica la semantica del repo
// real de Mongo: siempre filtra is_active === true y aplica category_id/brand_id si vienen.
class FakeProductRepository implements IProductRepository {
  constructor(private readonly products: Product[]) {}

  async create(): Promise<Product> {
    throw new Error("no usado en estos tests");
  }

  async getById(): Promise<Product | null> {
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

  async update(): Promise<Product | null> {
    throw new Error("no usado en estos tests");
  }

  async softDelete(): Promise<boolean> {
    throw new Error("no usado en estos tests");
  }
}

// Los repos de category y brand no se usan en getAll; basta con stubs vacios.
const categoryRepositoryStub = {} as ICategoryRepository;
const brandRepositoryStub = {} as IBrandRepository;

// Helper para armar productos de prueba sin repetir todos los campos.
function buildProduct(overrides: Partial<Product> & Pick<Product, "id">): Product {
  return {
    name: "Producto",
    description: null,
    type: "stock",
    price: 100,
    stock: 10,
    category_id: "cat-1",
    brand_id: "brand-1",
    is_active: true,
    ...overrides,
  };
}

describe("ProductService.getAll (filtros)", () => {
  let service: ProductService;

  // Dataset: combinaciones de categoria/marca + un inactivo que nunca debe aparecer.
  const products: Product[] = [
    buildProduct({ id: "1", category_id: "cat-1", brand_id: "brand-1" }),
    buildProduct({ id: "2", category_id: "cat-1", brand_id: "brand-2" }),
    buildProduct({ id: "3", category_id: "cat-2", brand_id: "brand-1" }),
    buildProduct({ id: "4", category_id: "cat-2", brand_id: "brand-2" }),
    buildProduct({ id: "5", category_id: "cat-1", brand_id: "brand-1", is_active: false }),
  ];

  beforeEach(() => {
    const repository = new FakeProductRepository(products);
    service = new ProductService(repository, categoryRepositoryStub, brandRepositoryStub);
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
