import { describe, it, expect, beforeEach } from "vitest";
import { OrderService } from "./order.service";
import { Order, OrderStatus } from "./order.entity";
import { IOrderRepository } from "./order.repository.interface";
import { Product } from "../product/product.entity";
import { IProductRepository } from "../product/product.repository.interface";
import { Cart } from "../cart/cart.entity";
import { ICartRepository } from "../cart/cart.repository.interface";
import { Customer } from "../customer/customer.entity";
import { ICustomerRepository } from "../customer/customer.repository.interface";
import { ForbiddenError, ValidationError } from "../errors";

// Fakes en memoria de los cuatro repositorios que consume OrderService.
// Cada fake guarda estado mutable para poder afirmar sobre los efectos
// secundarios: stock descontado o repuesto, carrito vaciado, estado de la orden.

class FakeProductRepository implements IProductRepository {
  constructor(readonly products: Map<string, Product>) {}

  async create(): Promise<Product> {
    throw new Error("no usado en estos tests");
  }

  // Replica la semantica del repo de Mongo: los inactivos no existen para el catalogo.
  async getById(id: string): Promise<Product | null> {
    const product = this.products.get(id);
    return product && product.is_active ? { ...product } : null;
  }

  async getAll(): Promise<Product[]> {
    return [...this.products.values()].filter((product) => product.is_active);
  }

  async update(id: string, data: Partial<Omit<Product, "id">>): Promise<Product | null> {
    const product = this.products.get(id);
    if (!product) return null;
    Object.assign(product, data);
    return { ...product };
  }

  async softDelete(): Promise<boolean> {
    throw new Error("no usado en estos tests");
  }

  // Replica la condicion del $inc atomico de Mongo: si no da el stock, no toca nada.
  async decrementStock(id: string, quantity: number): Promise<boolean> {
    const product = this.products.get(id);
    if (!product || !product.is_active || product.stock < quantity) return false;
    product.stock -= quantity;
    return true;
  }

  async incrementStock(id: string, quantity: number): Promise<void> {
    const product = this.products.get(id);
    if (product) product.stock += quantity;
  }

  // Helper de asercion: stock actual sin pasar por la semantica de is_active.
  stockOf(id: string): number {
    return this.products.get(id)?.stock ?? -1;
  }
}

class FakeOrderRepository implements IOrderRepository {
  readonly orders = new Map<string, Order>();
  private sequence = 0;

  async create(data: {
    customer_id: string;
    status: OrderStatus;
    delivery_type: string;
    delivery_address: string | null;
    total: number;
    items: {
      product_id: string;
      product_name: string;
      unit_price: number | null;
      quantity: number;
      type: string;
    }[];
  }): Promise<Order> {
    const id = `order-${++this.sequence}`;
    const order: Order = {
      id,
      customer_id: data.customer_id,
      status: data.status,
      delivery_type: data.delivery_type,
      delivery_address: data.delivery_address,
      total: data.total,
      created_at: "2026-01-01T00:00:00.000Z",
      items: data.items.map((item, index) => ({ id: `${id}-item-${index}`, ...item })),
    };
    this.orders.set(id, order);
    return order;
  }

  async getById(id: string): Promise<Order | null> {
    return this.orders.get(id) ?? null;
  }

  async getByCustomerId(customerId: string): Promise<Order[]> {
    return [...this.orders.values()].filter((order) => order.customer_id === customerId);
  }

  async getAll(statusFilter?: string): Promise<Order[]> {
    const all = [...this.orders.values()];
    return statusFilter ? all.filter((order) => order.status === statusFilter) : all;
  }

  async updateStatus(id: string, status: OrderStatus): Promise<Order | null> {
    const order = this.orders.get(id);
    if (!order) return null;
    order.status = status;
    return order;
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

  async updateItemQuantity(): Promise<void> {
    throw new Error("no usado en estos tests");
  }

  async removeItem(): Promise<boolean> {
    throw new Error("no usado en estos tests");
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

// Helpers para armar entidades de prueba sin repetir todos los campos.
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

// Escenario base compartido: dos clientes (user-1 -> cus-1, user-2 -> cus-2),
// dos productos de stock y uno por encargo.
function setup() {
  const productRepository = new FakeProductRepository(
    new Map([
      ["p1", buildProduct({ id: "p1", name: "Teclado", stock: 8, price: 100 })],
      ["p2", buildProduct({ id: "p2", name: "Mouse", stock: 4, price: 50 })],
      [
        "p-encargo",
        buildProduct({ id: "p-encargo", name: "Notebook", type: "encargo", price: null, stock: 0 }),
      ],
    ]),
  );
  const orderRepository = new FakeOrderRepository();
  const cartRepository = new FakeCartRepository();
  const customerRepository = new FakeCustomerRepository([
    buildCustomer({ id: "cus-1", user_id: "user-1" }),
    buildCustomer({ id: "cus-2", user_id: "user-2" }),
  ]);
  const service = new OrderService(
    orderRepository,
    productRepository,
    cartRepository,
    customerRepository,
  );

  return { service, productRepository, orderRepository, cartRepository };
}

type Context = ReturnType<typeof setup>;

describe("OrderService.createOrder", () => {
  let ctx: Context;

  beforeEach(() => {
    ctx = setup();
  });

  // Regresion: dos items del mismo producto pasaban la validacion por separado y
  // el descuento se aplicaba dos veces, dejando el stock en negativo.
  it("rechaza items duplicados cuya suma supera el stock, sin tocar el stock", async () => {
    await expect(
      ctx.service.createOrder("user-1", {
        delivery_type: "retiro",
        items: [
          { product_id: "p1", quantity: 5 },
          { product_id: "p1", quantity: 5 },
        ],
      }),
    ).rejects.toThrow(ValidationError);

    expect(ctx.productRepository.stockOf("p1")).toBe(8);
    expect(ctx.orderRepository.orders.size).toBe(0);
  });

  it("consolida items duplicados en una sola linea cuando la suma entra en stock", async () => {
    const order = await ctx.service.createOrder("user-1", {
      delivery_type: "retiro",
      items: [
        { product_id: "p1", quantity: 3 },
        { product_id: "p1", quantity: 2 },
      ],
    });

    expect(order.items).toHaveLength(1);
    expect(order.items[0]?.quantity).toBe(5);
    expect(order.total).toBe(500);
    expect(ctx.productRepository.stockOf("p1")).toBe(3);
  });

  it("rechaza con ValidationError si un item supera el stock disponible", async () => {
    await expect(
      ctx.service.createOrder("user-1", {
        delivery_type: "retiro",
        items: [{ product_id: "p2", quantity: 5 }],
      }),
    ).rejects.toThrow(ValidationError);

    expect(ctx.productRepository.stockOf("p2")).toBe(4);
    expect(ctx.orderRepository.orders.size).toBe(0);
  });

  it("no descuenta nada si un item posterior del pedido no tiene stock", async () => {
    await expect(
      ctx.service.createOrder("user-1", {
        delivery_type: "retiro",
        items: [
          { product_id: "p1", quantity: 2 },
          { product_id: "p2", quantity: 99 },
        ],
      }),
    ).rejects.toThrow(ValidationError);

    expect(ctx.productRepository.stockOf("p1")).toBe(8);
    expect(ctx.productRepository.stockOf("p2")).toBe(4);
  });

  // Simula la carrera que motiva el descuento atomico: entre la validacion del
  // paso 4 y el descuento del paso 5, otro pedido se lleva el stock de p2. Lo ya
  // descontado de p1 tiene que revertirse antes de propagar el error.
  it("revierte los descuentos ya aplicados si un decrementStock falla a mitad del pedido", async () => {
    const repository = ctx.productRepository;
    const decrementReal = repository.decrementStock.bind(repository);
    repository.decrementStock = async (id: string, quantity: number): Promise<boolean> =>
      id === "p2" ? false : decrementReal(id, quantity);

    await expect(
      ctx.service.createOrder("user-1", {
        delivery_type: "retiro",
        items: [
          { product_id: "p1", quantity: 2 },
          { product_id: "p2", quantity: 1 },
        ],
      }),
    ).rejects.toThrow(ValidationError);

    expect(repository.stockOf("p1")).toBe(8);
    expect(repository.stockOf("p2")).toBe(4);
  });

  it("exige delivery_address cuando delivery_type es 'envio'", async () => {
    await expect(
      ctx.service.createOrder("user-1", {
        delivery_type: "envio",
        items: [{ product_id: "p1", quantity: 1 }],
      }),
    ).rejects.toThrow(ValidationError);

    // Tampoco acepta una direccion en blanco.
    await expect(
      ctx.service.createOrder("user-1", {
        delivery_type: "envio",
        delivery_address: "   ",
        items: [{ product_id: "p1", quantity: 1 }],
      }),
    ).rejects.toThrow(ValidationError);

    expect(ctx.productRepository.stockOf("p1")).toBe(8);
  });

  it("acepta un envio con delivery_address y la guarda sin espacios sobrantes", async () => {
    const order = await ctx.service.createOrder("user-1", {
      delivery_type: "envio",
      delivery_address: "  Av. Siempreviva 742  ",
      items: [{ product_id: "p1", quantity: 1 }],
    });

    expect(order.delivery_type).toBe("envio");
    expect(order.delivery_address).toBe("Av. Siempreviva 742");
  });

  it("toma los items del carrito cuando el input no trae ninguno, y lo vacia", async () => {
    const cart = await ctx.cartRepository.createForCustomer("cus-1");
    await ctx.cartRepository.addItem(cart.id, "p1", 2);
    await ctx.cartRepository.addItem(cart.id, "p2", 1);

    const order = await ctx.service.createOrder("user-1", { delivery_type: "retiro" });

    expect(order.items).toHaveLength(2);
    expect(order.total).toBe(250);
    expect(ctx.productRepository.stockOf("p1")).toBe(6);
    expect(ctx.productRepository.stockOf("p2")).toBe(3);
    expect(ctx.cartRepository.carts.get(cart.id)?.items).toEqual([]);
  });

  it("rechaza si no hay items en el input ni en el carrito", async () => {
    await expect(ctx.service.createOrder("user-1", { delivery_type: "retiro" })).rejects.toThrow(
      ValidationError,
    );
  });

  it("no descuenta stock de los productos por encargo y los deja sin precio", async () => {
    const order = await ctx.service.createOrder("user-1", {
      delivery_type: "retiro",
      items: [{ product_id: "p-encargo", quantity: 2 }],
    });

    expect(order.items[0]?.unit_price).toBeNull();
    expect(order.total).toBe(0);
    expect(ctx.productRepository.stockOf("p-encargo")).toBe(0);
  });
});

describe("OrderService.changeStatus", () => {
  let ctx: Context;
  let orderId: string;

  beforeEach(async () => {
    ctx = setup();
    const order = await ctx.service.createOrder("user-1", {
      delivery_type: "retiro",
      items: [{ product_id: "p1", quantity: 1 }],
    });
    orderId = order.id;
  });

  it("avanza exactamente un paso del flujo", async () => {
    const order = await ctx.service.changeStatus(orderId, "confirmado");
    expect(order?.status).toBe("confirmado");
  });

  it("rechaza saltear pasos del flujo", async () => {
    await expect(ctx.service.changeStatus(orderId, "entregado")).rejects.toThrow(ValidationError);
    expect(ctx.orderRepository.orders.get(orderId)?.status).toBe("pendiente");
  });

  it("rechaza cambiar el estado de una orden cancelada", async () => {
    await ctx.service.cancelOrder(orderId, "user-1");

    await expect(ctx.service.changeStatus(orderId, "confirmado")).rejects.toThrow(ValidationError);
    expect(ctx.orderRepository.orders.get(orderId)?.status).toBe("cancelado");
  });

  it("devuelve null si la orden no existe", async () => {
    expect(await ctx.service.changeStatus("order-inexistente", "confirmado")).toBeNull();
  });
});

describe("OrderService.cancelOrder", () => {
  let ctx: Context;
  let orderId: string;

  beforeEach(async () => {
    ctx = setup();
    const order = await ctx.service.createOrder("user-1", {
      delivery_type: "retiro",
      items: [{ product_id: "p1", quantity: 3 }],
    });
    orderId = order.id;
  });

  it("cancela un pedido pendiente y repone el stock descontado", async () => {
    expect(ctx.productRepository.stockOf("p1")).toBe(5);

    const order = await ctx.service.cancelOrder(orderId, "user-1");

    expect(order?.status).toBe("cancelado");
    expect(ctx.productRepository.stockOf("p1")).toBe(8);
  });

  it("rechaza cancelar un pedido que ya no esta pendiente, sin reponer stock", async () => {
    await ctx.service.changeStatus(orderId, "confirmado");

    await expect(ctx.service.cancelOrder(orderId, "user-1")).rejects.toThrow(ValidationError);
    expect(ctx.productRepository.stockOf("p1")).toBe(5);
    expect(ctx.orderRepository.orders.get(orderId)?.status).toBe("confirmado");
  });

  it("rechaza con ForbiddenError si el pedido es de otro cliente", async () => {
    await expect(ctx.service.cancelOrder(orderId, "user-2")).rejects.toThrow(ForbiddenError);
    expect(ctx.productRepository.stockOf("p1")).toBe(5);
    expect(ctx.orderRepository.orders.get(orderId)?.status).toBe("pendiente");
  });

  it("devuelve null si la orden no existe", async () => {
    expect(await ctx.service.cancelOrder("order-inexistente", "user-1")).toBeNull();
  });
});

describe("OrderService.getById", () => {
  let ctx: Context;
  let orderId: string;

  beforeEach(async () => {
    ctx = setup();
    const order = await ctx.service.createOrder("user-1", {
      delivery_type: "retiro",
      items: [{ product_id: "p1", quantity: 1 }],
    });
    orderId = order.id;
  });

  it("el owner puede ver el pedido de cualquier cliente", async () => {
    const order = await ctx.service.getById(orderId, "user-owner", "owner");
    expect(order?.id).toBe(orderId);
  });

  it("el cliente puede ver su propio pedido", async () => {
    const order = await ctx.service.getById(orderId, "user-1", "cliente");
    expect(order?.id).toBe(orderId);
  });

  it("un cliente ajeno recibe ForbiddenError", async () => {
    await expect(ctx.service.getById(orderId, "user-2", "cliente")).rejects.toThrow(ForbiddenError);
  });

  it("devuelve null si la orden no existe", async () => {
    expect(await ctx.service.getById("order-inexistente", "user-1", "cliente")).toBeNull();
  });
});
