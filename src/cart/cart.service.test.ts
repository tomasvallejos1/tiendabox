import { describe, it, expect, beforeEach } from "vitest";
import { CartService } from "./cart.service";
import { Cart } from "./cart.entity";
import { ICartRepository } from "./cart.repository.interface";
import { Product } from "../product/product.entity";
import { IProductRepository } from "../product/product.repository.interface";
import { Customer } from "../customer/customer.entity";
import { ICustomerRepository } from "../customer/customer.repository.interface";
import { ValidationError } from "../errors";

// In-memory fakes of the three repositories CartService depends on.

class FakeProductRepository implements IProductRepository {
  // Counts getByIds calls to assert a single Mongo query per response.
  getByIdsCalls = 0;

  constructor(readonly products: Map<string, Product>) {}

  async create(): Promise<Product> {
    throw new Error("no usado en estos tests");
  }

  // Mirrors the Mongo repo: inactive products do not exist for the catalog.
  async getById(id: string): Promise<Product | null> {
    const product = this.products.get(id);
    return product && product.is_active ? { ...product } : null;
  }

  // Mirrors the Mongo repo: returns inactive products too.
  async getByIds(ids: string[]): Promise<Product[]> {
    this.getByIdsCalls++;
    return [...this.products.values()]
      .filter((product) => ids.includes(product.id))
      .map((product) => ({ ...product }));
  }

  async getAll(): Promise<Product[]> {
    throw new Error("no usado en estos tests");
  }

  async update(): Promise<Product | null> {
    throw new Error("no usado en estos tests");
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
}

class FakeCartRepository implements ICartRepository {
  readonly carts = new Map<string, Cart>();

  async getByCustomerId(customerId: string): Promise<Cart | null> {
    return [...this.carts.values()].find((cart) => cart.customer_id === customerId) ?? null;
  }

  async createForCustomer(customerId: string): Promise<Cart> {
    const cart: Cart = {
      id: `cart-${this.carts.size + 1}`,
      customer_id: customerId,
      items: [],
      updated_at: "2026-01-01T00:00:00.000Z",
    };
    this.carts.set(cart.id, cart);
    return cart;
  }

  async addItem(cartId: string, productId: string, quantity: number): Promise<void> {
    const cart = this.carts.get(cartId);
    if (!cart) return;
    cart.items.push({ id: `${cartId}-item-${cart.items.length}`, product_id: productId, quantity });
  }

  async updateItemQuantity(cartId: string, productId: string, quantity: number): Promise<void> {
    const item = this.carts.get(cartId)?.items.find((i) => i.product_id === productId);
    if (item) item.quantity = quantity;
  }

  async removeItem(cartId: string, productId: string): Promise<boolean> {
    const cart = this.carts.get(cartId);
    if (!cart) return false;
    const before = cart.items.length;
    cart.items = cart.items.filter((item) => item.product_id !== productId);
    return cart.items.length < before;
  }

  async clear(cartId: string): Promise<void> {
    const cart = this.carts.get(cartId);
    if (cart) cart.items = [];
  }
}

class FakeCustomerRepository implements ICustomerRepository {
  constructor(private readonly customers: Customer[]) {}

  async create(): Promise<Customer> {
    throw new Error("no usado en estos tests");
  }

  async getById(id: string): Promise<Customer | null> {
    return this.customers.find((customer) => customer.id === id) ?? null;
  }

  async getByUserId(userId: string): Promise<Customer | null> {
    return this.customers.find((customer) => customer.user_id === userId) ?? null;
  }

  async getAll(): Promise<Customer[]> {
    return [...this.customers];
  }

  async update(): Promise<Customer | null> {
    throw new Error("no usado en estos tests");
  }

  async delete(): Promise<boolean> {
    throw new Error("no usado en estos tests");
  }
}

// Helpers to build test entities without repeating every field.
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

function buildCustomer(overrides: Partial<Customer> & Pick<Customer, "id" | "user_id">): Customer {
  return {
    name: "Cliente",
    government_id: null,
    tax_status: "consumidor_final",
    phone: null,
    address: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// Shared scenario: one customer (user-1 -> cus-1) with an empty cart, a stock
// product, a low-stock product, an "encargo" product and a discontinued one.
function setup() {
  const productRepository = new FakeProductRepository(
    new Map([
      ["p-stock", buildProduct({ id: "p-stock", name: "Teclado", price: 100, stock: 10 })],
      ["p-low", buildProduct({ id: "p-low", name: "Mouse", price: 50, stock: 2 })],
      [
        "p-encargo",
        buildProduct({ id: "p-encargo", name: "Notebook", type: "encargo", price: null, stock: 0 }),
      ],
      ["p-inactive", buildProduct({ id: "p-inactive", name: "Monitor", is_active: false })],
    ]),
  );
  const cartRepository = new FakeCartRepository();
  const customerRepository = new FakeCustomerRepository([
    buildCustomer({ id: "cus-1", user_id: "user-1" }),
  ]);
  const service = new CartService(cartRepository, productRepository, customerRepository);

  return { service, productRepository, cartRepository };
}

type Context = ReturnType<typeof setup>;

// Loads items straight into the repo, bypassing addItem validations, to simulate
// carts whose products changed after being added (discontinued, stock dropped).
async function seedCart(ctx: Context, items: [string, number][]): Promise<void> {
  const cart = await ctx.cartRepository.createForCustomer("cus-1");
  for (const [productId, quantity] of items) {
    await ctx.cartRepository.addItem(cart.id, productId, quantity);
  }
}

describe("CartService (carrito enriquecido)", () => {
  let ctx: Context;

  beforeEach(() => {
    ctx = setup();
  });

  it("un item tipo stock trae unit_price, subtotal correcto y suma al total", async () => {
    await seedCart(ctx, [["p-stock", 3]]);

    const cart = await ctx.service.getCart("user-1");
    const item = cart.items[0]!;

    expect(item.name).toBe("Teclado");
    expect(item.type).toBe("stock");
    expect(item.unit_price).toBe(100);
    expect(item.stock_available).toBe(10);
    expect(item.subtotal).toBe(300);
    expect(item.available).toBe(true);
    expect(item.exceeds_stock).toBe(false);
    expect(cart.total).toBe(300);
    expect(cart.has_encargo_items).toBe(false);
    expect(cart.has_unavailable_items).toBe(false);
  });

  it("un item por encargo trae unit_price y subtotal en null y no suma al total", async () => {
    await seedCart(ctx, [
      ["p-stock", 1],
      ["p-encargo", 2],
    ]);

    const cart = await ctx.service.getCart("user-1");
    const item = cart.items.find((i) => i.product_id === "p-encargo")!;

    expect(item.name).toBe("Notebook");
    expect(item.type).toBe("encargo");
    expect(item.unit_price).toBeNull();
    expect(item.stock_available).toBeNull();
    expect(item.subtotal).toBeNull();
    expect(item.available).toBe(true);
    expect(cart.total).toBe(100);
    expect(cart.has_encargo_items).toBe(true);
  });

  it("un producto inactivo queda como no disponible y no suma al total", async () => {
    await seedCart(ctx, [
      ["p-stock", 1],
      ["p-inactive", 4],
    ]);

    const cart = await ctx.service.getCart("user-1");
    const item = cart.items.find((i) => i.product_id === "p-inactive")!;

    expect(item.available).toBe(false);
    expect(item.name).toBe("Monitor");
    expect(item.unit_price).toBeNull();
    expect(item.stock_available).toBeNull();
    expect(item.subtotal).toBeNull();
    expect(item.exceeds_stock).toBe(false);
    expect(cart.total).toBe(100);
    expect(cart.has_unavailable_items).toBe(true);
  });

  it("un producto inexistente queda como no disponible y con name null", async () => {
    await seedCart(ctx, [["p-borrado", 1]]);

    const cart = await ctx.service.getCart("user-1");
    const item = cart.items[0]!;

    expect(item.available).toBe(false);
    expect(item.name).toBeNull();
    expect(item.type).toBeNull();
    expect(cart.total).toBe(0);
    expect(cart.has_unavailable_items).toBe(true);
  });

  it("marca exceeds_stock cuando la cantidad supera el stock actual", async () => {
    await seedCart(ctx, [["p-low", 5]]);

    const cart = await ctx.service.getCart("user-1");

    expect(cart.items[0]?.exceeds_stock).toBe(true);
    expect(cart.items[0]?.stock_available).toBe(2);
  });

  it("item_count es la suma de las cantidades", async () => {
    await seedCart(ctx, [
      ["p-stock", 3],
      ["p-encargo", 2],
      ["p-inactive", 1],
    ]);

    const cart = await ctx.service.getCart("user-1");

    expect(cart.item_count).toBe(6);
  });

  it("devuelve un carrito vacio con total 0 si el cliente no tenia carrito", async () => {
    const cart = await ctx.service.getCart("user-1");

    expect(cart.items).toEqual([]);
    expect(cart.item_count).toBe(0);
    expect(cart.total).toBe(0);
  });

  it("llama a getByIds una sola vez por carrito, sin importar la cantidad de items", async () => {
    await seedCart(ctx, [
      ["p-stock", 1],
      ["p-low", 1],
      ["p-encargo", 1],
      ["p-inactive", 1],
    ]);

    await ctx.service.getCart("user-1");
    expect(ctx.productRepository.getByIdsCalls).toBe(1);

    await ctx.service.addItem("user-1", "p-stock", 1);
    expect(ctx.productRepository.getByIdsCalls).toBe(2);

    await ctx.service.removeItem("user-1", "p-low");
    expect(ctx.productRepository.getByIdsCalls).toBe(3);
  });

  it("addItem devuelve el carrito enriquecido con el item agregado", async () => {
    const cart = await ctx.service.addItem("user-1", "p-stock", 2);

    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]?.subtotal).toBe(200);
    expect(cart.total).toBe(200);
  });

  it("addItem sigue rechazando una cantidad mayor al stock", async () => {
    await expect(ctx.service.addItem("user-1", "p-low", 3)).rejects.toThrow(ValidationError);
  });

  it("removeItem devuelve el carrito enriquecido sin el item", async () => {
    await seedCart(ctx, [
      ["p-stock", 1],
      ["p-low", 1],
    ]);

    const cart = await ctx.service.removeItem("user-1", "p-low");

    expect(cart.items.map((i) => i.product_id)).toEqual(["p-stock"]);
    expect(cart.total).toBe(100);
  });
});
