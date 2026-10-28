import { CartService } from "../../src/cart/cart.service";
import { Cart } from "../../src/cart/cart.entity";
import { ICartRepository } from "../../src/cart/cart.repository.interface";
import { Product } from "../../src/product/product.entity";
import { IProductRepository } from "../../src/product/product.repository.interface";
import { Customer } from "../../src/customer/customer.entity";
import { ICustomerRepository } from "../../src/customer/customer.repository.interface";
import { ValidationError } from "../../src/errors";
import { validCustomer, validProduct } from "../fixtures";

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

  async getByIds(ids: string[]): Promise<Customer[]> {
    return this.customers.filter((customer) => ids.includes(customer.id));
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

// Shared scenario: one customer (user-1 -> cus-1) with an empty cart, a stock
// product, a low-stock product, an "encargo" product and a discontinued one.
function setup() {
  const productRepository = new FakeProductRepository(
    new Map<string, Product>([
      ["p-stock", { ...validProduct, id: "p-stock", name: "Teclado", price: 100, stock: 10 }],
      ["p-low", { ...validProduct, id: "p-low", name: "Mouse", price: 50, stock: 2 }],
      [
        "p-encargo",
        {
          ...validProduct,
          id: "p-encargo",
          name: "Notebook",
          type: "encargo",
          price: null,
          stock: 0,
        },
      ],
      ["p-inactive", { ...validProduct, id: "p-inactive", name: "Monitor", is_active: false }],
    ]),
  );
  const cartRepository = new FakeCartRepository();
  const customerRepository = new FakeCustomerRepository([
    { ...validCustomer, id: "cus-1", user_id: "user-1" },
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

  describe("updateItemQuantity", () => {
    it("fija la cantidad de 3 a 1 sin sumarla y la guarda", async () => {
      await seedCart(ctx, [["p-stock", 3]]);

      const cart = await ctx.service.updateItemQuantity("user-1", "p-stock", 1);

      expect(cart.items).toHaveLength(1);
      expect(cart.items[0]?.quantity).toBe(1);
      const stored = await ctx.cartRepository.getByCustomerId("cus-1");
      expect(stored?.items[0]?.quantity).toBe(1);
    });

    it("permite subir la cantidad hasta el stock exacto", async () => {
      await seedCart(ctx, [["p-stock", 3]]);

      const cart = await ctx.service.updateItemQuantity("user-1", "p-stock", 10);

      expect(cart.items[0]?.quantity).toBe(10);
      expect(cart.items[0]?.exceeds_stock).toBe(false);
      expect(cart.total).toBe(1000);
    });

    it("rechaza superar el stock sin modificar la cantidad guardada", async () => {
      await seedCart(ctx, [["p-low", 1]]);

      await expect(ctx.service.updateItemQuantity("user-1", "p-low", 3)).rejects.toThrow(
        new ValidationError("Stock insuficiente. Disponible: 2"),
      );
      const stored = await ctx.cartRepository.getByCustomerId("cus-1");
      expect(stored?.items[0]?.quantity).toBe(1);
    });

    it("permite una cantidad sin limite de stock para productos por encargo", async () => {
      await seedCart(ctx, [["p-encargo", 1]]);

      const cart = await ctx.service.updateItemQuantity("user-1", "p-encargo", 1000);

      expect(cart.items[0]?.quantity).toBe(1000);
      expect(cart.items[0]?.subtotal).toBeNull();
      expect(cart.item_count).toBe(1000);
      expect(cart.total).toBe(0);
      expect(cart.has_encargo_items).toBe(true);
    });

    it.each([0, -1, 1.5, "1", "", null, undefined])(
      "rechaza la cantidad invalida %p sin modificar el carrito",
      async (quantity) => {
        await seedCart(ctx, [["p-stock", 3]]);

        await expect(ctx.service.updateItemQuantity("user-1", "p-stock", quantity)).rejects.toThrow(
          new ValidationError("La cantidad debe ser un entero mayor a 0"),
        );
        const stored = await ctx.cartRepository.getByCustomerId("cus-1");
        expect(stored?.items[0]?.quantity).toBe(3);
      },
    );

    it("rechaza un producto que no esta en el carrito", async () => {
      await seedCart(ctx, [["p-stock", 1]]);

      await expect(ctx.service.updateItemQuantity("user-1", "p-low", 1)).rejects.toThrow(
        new ValidationError("El producto no está en el carrito"),
      );
      const stored = await ctx.cartRepository.getByCustomerId("cus-1");
      expect(stored?.items.map((item) => item.product_id)).toEqual(["p-stock"]);
    });

    it("rechaza la actualizacion sin crear un carrito si el cliente no tiene uno", async () => {
      await expect(ctx.service.updateItemQuantity("user-1", "p-stock", 1)).rejects.toThrow(
        new ValidationError("El producto no está en el carrito"),
      );
      expect(ctx.cartRepository.carts.size).toBe(0);
    });

    it.each(["p-inactive", "p-borrado"])(
      "rechaza el producto no disponible %s sin modificar el carrito",
      async (productId) => {
        await seedCart(ctx, [[productId, 3]]);

        await expect(ctx.service.updateItemQuantity("user-1", productId, 1)).rejects.toThrow(
          new ValidationError("Producto no disponible"),
        );
        const stored = await ctx.cartRepository.getByCustomerId("cus-1");
        expect(stored?.items[0]?.quantity).toBe(3);
      },
    );

    it("devuelve el detalle con item_count, subtotales y total recalculados", async () => {
      await seedCart(ctx, [
        ["p-stock", 3],
        ["p-low", 2],
        ["p-encargo", 4],
      ]);

      const cart = await ctx.service.updateItemQuantity("user-1", "p-stock", 1);

      expect(cart.items.map((item) => [item.product_id, item.quantity, item.subtotal])).toEqual([
        ["p-stock", 1, 100],
        ["p-low", 2, 100],
        ["p-encargo", 4, null],
      ]);
      expect(cart.item_count).toBe(7);
      expect(cart.total).toBe(200);
      expect(ctx.productRepository.getByIdsCalls).toBe(1);
    });
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
