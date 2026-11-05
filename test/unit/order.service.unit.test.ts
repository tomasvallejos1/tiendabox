import { OrderService } from "../../src/order/order.service";
import { Order, OrderStatus } from "../../src/order/order.entity";
import { IOrderRepository } from "../../src/order/order.repository.interface";
import { Product } from "../../src/product/product.entity";
import { IProductRepository } from "../../src/product/product.repository.interface";
import { Cart } from "../../src/cart/cart.entity";
import { ICartRepository } from "../../src/cart/cart.repository.interface";
import { Customer } from "../../src/customer/customer.entity";
import { ICustomerRepository } from "../../src/customer/customer.repository.interface";
import { ForbiddenError, ValidationError } from "../../src/errors";
import { validCustomer, validProduct } from "../fixtures";

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

  // Mirrors the Mongo repo: returns inactive products too.
  async getByIds(ids: string[]): Promise<Product[]> {
    return [...this.products.values()]
      .filter((product) => ids.includes(product.id))
      .map((product) => ({ ...product }));
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

  async countActiveByCategory(): Promise<number> {
    throw new Error("no usado en estos tests");
  }

  async countActiveByBrand(): Promise<number> {
    throw new Error("no usado en estos tests");
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

  async existsForCustomer(): Promise<boolean> {
    throw new Error("no usado en estos tests");
  }

  // Simula otro request que cambia el pedido entre la lectura del service y su escritura.
  beforeUpdateIf: ((order: Order) => void) | null = null;

  // Replica el UPDATE ... WHERE status = ANY(from) de Postgres: el chequeo y la escritura
  // son un solo paso sincronico, sin awaits en el medio que permitan intercalar otro request.
  async updateStatusIf(id: string, from: OrderStatus[], to: OrderStatus): Promise<Order | null> {
    const order = this.orders.get(id);
    if (!order) return null;
    this.beforeUpdateIf?.(order);
    if (!from.includes(order.status)) return null;
    order.status = to;
    return { ...order };
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

  async deleteByCustomerId(): Promise<void> {
    throw new Error("no usado en estos tests");
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

// Escenario base compartido: dos clientes (user-1 -> cus-1, user-2 -> cus-2),
// dos productos de stock y uno por encargo.
function setup(customerOverrides: Partial<Customer> = {}) {
  const productRepository = new FakeProductRepository(
    new Map<string, Product>([
      ["p1", { ...validProduct, id: "p1", name: "Teclado", stock: 8, price: 100 }],
      ["p2", { ...validProduct, id: "p2", name: "Mouse", stock: 4, price: 50 }],
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
    ]),
  );
  const orderRepository = new FakeOrderRepository();
  const cartRepository = new FakeCartRepository();
  const customerRepository = new FakeCustomerRepository([
    {
      ...validCustomer,
      id: "cus-1",
      user_id: "user-1",
      phone: "+54 11 1234 5678",
      ...customerOverrides,
    },
    { ...validCustomer, id: "cus-2", user_id: "user-2" },
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

  it.each([
    { phone: null, productId: "p1", scenario: "sin telefono y carrito solo stock" },
    { phone: null, productId: "p-encargo", scenario: "sin telefono y carrito con encargo" },
    { phone: "   ", productId: "p1", scenario: "con telefono de solo espacios" },
    { phone: "", productId: "p1", scenario: "con telefono vacio" },
    { phone: " +()- abc ", productId: "p1", scenario: "con telefono sin digitos" },
  ])(
    "rechaza al cliente $scenario sin crear pedido ni vaciar carrito",
    async ({ phone, productId }) => {
      ctx = setup({ phone });
      const cart = await ctx.cartRepository.createForCustomer("cus-1");
      await ctx.cartRepository.addItem(cart.id, "p1", 1);
      await ctx.cartRepository.addItem(cart.id, productId, 1);
      const originalItems = cart.items.map((item) => ({ ...item }));

      const creation = ctx.service.createOrder("user-1", "cliente", { delivery_type: "retiro" });

      await expect(creation).rejects.toThrow(ValidationError);
      await expect(creation).rejects.toThrow(
        "Completá tu teléfono en Mi perfil para poder confirmar el pedido",
      );
      expect(ctx.orderRepository.orders.size).toBe(0);
      expect(ctx.cartRepository.carts.get(cart.id)?.items).toEqual(originalItems);
      expect(ctx.productRepository.stockOf("p1")).toBe(8);
    },
  );

  it.each([" 1 ", "+54 11 1234 5678"])(
    "crea el pedido del cliente con telefono '%s' sin exigir documento ni condicion fiscal",
    async (phone) => {
      ctx = setup({ phone, government_id: null, tax_status: "" });
      const cart = await ctx.cartRepository.createForCustomer("cus-1");
      await ctx.cartRepository.addItem(cart.id, "p1", 1);
      await ctx.cartRepository.addItem(cart.id, "p-encargo", 1);

      const order = await ctx.service.createOrder("user-1", "cliente", {
        delivery_type: "retiro",
      });

      expect(ctx.orderRepository.orders.get(order.id)).toBeDefined();
      expect(order.customer?.phone).toBe(phone);
      expect(order.items).toHaveLength(2);
      expect(ctx.cartRepository.carts.get(cart.id)?.items).toEqual([]);
    },
  );

  it("el owner crea un pedido solo stock para un cliente sin telefono", async () => {
    ctx = setup({ phone: null });

    const order = await ctx.service.createOrder("user-owner", "owner", {
      customer_id: "cus-1",
      delivery_type: "retiro",
      items: [{ product_id: "p1", quantity: 1 }],
    });

    expect(ctx.orderRepository.orders.get(order.id)).toBeDefined();
    expect(order.customer?.phone).toBeNull();
    expect(ctx.productRepository.stockOf("p1")).toBe(7);
  });

  it.each([null, "   ", " +()- abc "])(
    "rechaza al owner con encargo y telefono %p sin crear pedido ni vaciar carrito",
    async (phone) => {
      ctx = setup({ phone });
      const cart = await ctx.cartRepository.createForCustomer("cus-1");
      await ctx.cartRepository.addItem(cart.id, "p2", 1);
      const originalItems = cart.items.map((item) => ({ ...item }));

      const creation = ctx.service.createOrder("user-owner", "owner", {
        customer_id: "cus-1",
        delivery_type: "retiro",
        items: [
          { product_id: "p1", quantity: 1 },
          { product_id: "p-encargo", quantity: 1 },
        ],
      });

      await expect(creation).rejects.toThrow(ValidationError);
      await expect(creation).rejects.toThrow(
        "El cliente no tiene teléfono cargado y el pedido incluye productos por encargo, que se cotizan por WhatsApp",
      );
      expect(ctx.orderRepository.orders.size).toBe(0);
      expect(ctx.cartRepository.carts.get(cart.id)?.items).toEqual(originalItems);
      expect(ctx.productRepository.stockOf("p1")).toBe(8);
      expect(ctx.productRepository.stockOf("p2")).toBe(4);
    },
  );

  it("el owner crea un pedido con encargo para un cliente con telefono", async () => {
    const order = await ctx.service.createOrder("user-owner", "owner", {
      customer_id: "cus-1",
      delivery_type: "retiro",
      items: [{ product_id: "p-encargo", quantity: 1 }],
    });

    expect(ctx.orderRepository.orders.get(order.id)).toBeDefined();
    expect(order.customer?.phone).toBe("+54 11 1234 5678");
    expect(order.items[0]?.type).toBe("encargo");
  });

  // Regresion: dos items del mismo producto pasaban la validacion por separado y
  // el descuento se aplicaba dos veces, dejando el stock en negativo.
  it("rechaza items duplicados cuya suma supera el stock, sin tocar el stock", async () => {
    await expect(
      ctx.service.createOrder("user-1", "cliente", {
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
    const order = await ctx.service.createOrder("user-1", "cliente", {
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
      ctx.service.createOrder("user-1", "cliente", {
        delivery_type: "retiro",
        items: [{ product_id: "p2", quantity: 5 }],
      }),
    ).rejects.toThrow(ValidationError);

    expect(ctx.productRepository.stockOf("p2")).toBe(4);
    expect(ctx.orderRepository.orders.size).toBe(0);
  });

  it("no descuenta nada si un item posterior del pedido no tiene stock", async () => {
    await expect(
      ctx.service.createOrder("user-1", "cliente", {
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
      ctx.service.createOrder("user-1", "cliente", {
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
      ctx.service.createOrder("user-1", "cliente", {
        delivery_type: "envio",
        items: [{ product_id: "p1", quantity: 1 }],
      }),
    ).rejects.toThrow(ValidationError);

    // Tampoco acepta una direccion en blanco.
    await expect(
      ctx.service.createOrder("user-1", "cliente", {
        delivery_type: "envio",
        delivery_address: "   ",
        items: [{ product_id: "p1", quantity: 1 }],
      }),
    ).rejects.toThrow(ValidationError);

    expect(ctx.productRepository.stockOf("p1")).toBe(8);
  });

  it("acepta un envio con delivery_address y la guarda sin espacios sobrantes", async () => {
    const order = await ctx.service.createOrder("user-1", "cliente", {
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

    const order = await ctx.service.createOrder("user-1", "cliente", { delivery_type: "retiro" });

    expect(order.items).toHaveLength(2);
    expect(order.total).toBe(250);
    expect(ctx.productRepository.stockOf("p1")).toBe(6);
    expect(ctx.productRepository.stockOf("p2")).toBe(3);
    expect(ctx.cartRepository.carts.get(cart.id)?.items).toEqual([]);
  });

  it("rechaza si no hay items en el input ni en el carrito", async () => {
    await expect(
      ctx.service.createOrder("user-1", "cliente", { delivery_type: "retiro" }),
    ).rejects.toThrow(ValidationError);
  });

  it("no descuenta stock de los productos por encargo y los deja sin precio", async () => {
    const order = await ctx.service.createOrder("user-1", "cliente", {
      delivery_type: "retiro",
      items: [{ product_id: "p-encargo", quantity: 2 }],
    });

    expect(order.items[0]?.unit_price).toBeNull();
    expect(order.total).toBe(0);
    expect(ctx.productRepository.stockOf("p-encargo")).toBe(0);
  });

  // El owner no tiene perfil de cliente: crea el pedido a nombre del customer_id indicado.
  it("el owner crea un pedido con customer_id e items a nombre de ese cliente", async () => {
    const order = await ctx.service.createOrder("user-owner", "owner", {
      customer_id: "cus-2",
      delivery_type: "retiro",
      items: [{ product_id: "p1", quantity: 2 }],
    });

    expect(order.customer_id).toBe("cus-2");
    expect(order.customer?.id).toBe("cus-2");
    expect(order.total).toBe(200);
    expect(ctx.productRepository.stockOf("p1")).toBe(6);
  });

  it("rechaza con ValidationError si el owner no indica customer_id", async () => {
    await expect(
      ctx.service.createOrder("user-owner", "owner", {
        delivery_type: "retiro",
        items: [{ product_id: "p1", quantity: 1 }],
      }),
    ).rejects.toThrow(ValidationError);

    expect(ctx.productRepository.stockOf("p1")).toBe(8);
    expect(ctx.orderRepository.orders.size).toBe(0);
  });

  it("rechaza con ValidationError si el owner indica un cliente que no existe", async () => {
    await expect(
      ctx.service.createOrder("user-owner", "owner", {
        customer_id: "cus-inexistente",
        delivery_type: "retiro",
        items: [{ product_id: "p1", quantity: 1 }],
      }),
    ).rejects.toThrow("El cliente indicado no existe");

    expect(ctx.orderRepository.orders.size).toBe(0);
  });

  // Aunque el cliente tenga carrito, el owner no puede armar el pedido con el.
  it("rechaza con ValidationError si el owner no indica items", async () => {
    const cart = await ctx.cartRepository.createForCustomer("cus-1");
    await ctx.cartRepository.addItem(cart.id, "p1", 2);

    await expect(
      ctx.service.createOrder("user-owner", "owner", {
        customer_id: "cus-1",
        delivery_type: "retiro",
      }),
    ).rejects.toThrow("Debe indicar los productos del pedido");

    expect(ctx.productRepository.stockOf("p1")).toBe(8);
    expect(ctx.orderRepository.orders.size).toBe(0);
  });

  it("no vacia el carrito del cliente cuando el pedido lo crea el owner", async () => {
    const cart = await ctx.cartRepository.createForCustomer("cus-1");
    await ctx.cartRepository.addItem(cart.id, "p2", 1);

    await ctx.service.createOrder("user-owner", "owner", {
      customer_id: "cus-1",
      delivery_type: "retiro",
      items: [{ product_id: "p1", quantity: 1 }],
    });

    expect(ctx.cartRepository.carts.get(cart.id)?.items).toHaveLength(1);
    expect(ctx.productRepository.stockOf("p2")).toBe(4);
  });

  describe("items mal formados", () => {
    const ITEM_INVALIDO = "Cada item debe tener 'product_id' y 'quantity'";

    // Antes, [null] daba 500 (raw.quantity sobre null) y un product_id objeto llegaba a
    // Mongo como operador: { "$gt": "" } matcheaba el primer producto de la coleccion.
    it.each([
      { items: [null], mensaje: ITEM_INVALIDO, caso: "[null]" },
      { items: ["p1"], mensaje: ITEM_INVALIDO, caso: "un item string" },
      { items: [[1, 2]], mensaje: ITEM_INVALIDO, caso: "un item array" },
      { items: [{ quantity: 1 }], mensaje: ITEM_INVALIDO, caso: "un item sin product_id" },
      { items: [{ product_id: "p1" }], mensaje: ITEM_INVALIDO, caso: "un item sin quantity" },
      {
        items: [{ product_id: { $gt: "" }, quantity: 1 }],
        mensaje: "El campo 'product_id' es obligatorio",
        caso: "product_id objeto",
      },
      {
        items: [{ product_id: 7, quantity: 1 }],
        mensaje: "El campo 'product_id' es obligatorio",
        caso: "product_id numero",
      },
      {
        items: [{ product_id: "p1", quantity: 1.5 }],
        mensaje: "La cantidad de cada item debe ser un entero mayor a 0",
        caso: "quantity decimal",
      },
      { items: "abc", mensaje: "El campo 'items' debe ser una lista", caso: 'items "abc"' },
      { items: null, mensaje: "El campo 'items' debe ser una lista", caso: "items null" },
      { items: { 0: "p1" }, mensaje: "El campo 'items' debe ser una lista", caso: "items objeto" },
    ])(
      "rechaza $caso sin tocar stock ni crear pedido (cliente y owner)",
      async ({ items, mensaje }) => {
        const getById = jest.spyOn(ctx.productRepository, "getById");

        for (const [userId, role] of [
          ["user-1", "cliente"],
          ["user-owner", "owner"],
        ] as const) {
          const creation = ctx.service.createOrder(userId, role, {
            customer_id: "cus-1",
            delivery_type: "retiro",
            // El primer item es valido: nada del pedido se procesa si uno esta mal formado.
            items: Array.isArray(items) ? [{ product_id: "p1", quantity: 1 }, ...items] : items,
          });

          await expect(creation).rejects.toThrow(new ValidationError(mensaje));
        }

        expect(getById).not.toHaveBeenCalled();
        expect(ctx.productRepository.stockOf("p1")).toBe(8);
        expect(ctx.orderRepository.orders.size).toBe(0);
      },
    );

    it("el cliente que manda items vacios usa su carrito", async () => {
      const cart = await ctx.cartRepository.createForCustomer("cus-1");
      await ctx.cartRepository.addItem(cart.id, "p2", 1);

      const order = await ctx.service.createOrder("user-1", "cliente", {
        delivery_type: "retiro",
        items: [],
      });

      expect(order.items.map((item) => item.product_id)).toEqual(["p2"]);
      expect(ctx.cartRepository.carts.get(cart.id)?.items).toEqual([]);
    });
  });

  // Un cliente no puede crear pedidos a nombre de otro.
  it("ignora el customer_id cuando el pedido lo crea un cliente", async () => {
    const order = await ctx.service.createOrder("user-1", "cliente", {
      customer_id: "cus-2",
      delivery_type: "retiro",
      items: [{ product_id: "p1", quantity: 1 }],
    });

    expect(order.customer_id).toBe("cus-1");
  });
});

describe("OrderService.changeStatus", () => {
  let ctx: Context;
  let orderId: string;

  beforeEach(async () => {
    ctx = setup();
    const order = await ctx.service.createOrder("user-1", "cliente", {
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
    await ctx.service.cancelOrder(orderId, "user-1", "cliente");

    await expect(ctx.service.changeStatus(orderId, "confirmado")).rejects.toThrow(ValidationError);
    expect(ctx.orderRepository.orders.get(orderId)?.status).toBe("cancelado");
  });

  it("devuelve null si la orden no existe", async () => {
    expect(await ctx.service.changeStatus("order-inexistente", "confirmado")).toBeNull();
  });

  // Otro request cancela el pedido entre la lectura y la escritura: el avance no se aplica.
  it("rechaza el avance si el pedido cambio de estado mientras se procesaba", async () => {
    ctx.orderRepository.beforeUpdateIf = (order) => {
      order.status = "cancelado";
    };

    await expect(ctx.service.changeStatus(orderId, "confirmado")).rejects.toThrow(
      new ValidationError("El pedido cambió de estado mientras se procesaba. Volvé a cargarlo."),
    );
    expect(ctx.orderRepository.orders.get(orderId)?.status).toBe("cancelado");
  });

  it("de dos avances simultaneos al mismo estado, solo uno se aplica", async () => {
    const results = await Promise.allSettled([
      ctx.service.changeStatus(orderId, "confirmado"),
      ctx.service.changeStatus(orderId, "confirmado"),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(ctx.orderRepository.orders.get(orderId)?.status).toBe("confirmado");
  });
});

describe("OrderService.cancelOrder", () => {
  let ctx: Context;
  let orderId: string;

  beforeEach(async () => {
    ctx = setup();
    const order = await ctx.service.createOrder("user-1", "cliente", {
      delivery_type: "retiro",
      items: [{ product_id: "p1", quantity: 3 }],
    });
    orderId = order.id;
  });

  it("cancela un pedido pendiente y repone el stock descontado", async () => {
    expect(ctx.productRepository.stockOf("p1")).toBe(5);

    const order = await ctx.service.cancelOrder(orderId, "user-1", "cliente");

    expect(order?.status).toBe("cancelado");
    expect(ctx.productRepository.stockOf("p1")).toBe(8);
  });

  it("rechaza cancelar un pedido que ya no esta pendiente, sin reponer stock", async () => {
    await ctx.service.changeStatus(orderId, "confirmado");

    await expect(ctx.service.cancelOrder(orderId, "user-1", "cliente")).rejects.toThrow(
      ValidationError,
    );
    expect(ctx.productRepository.stockOf("p1")).toBe(5);
    expect(ctx.orderRepository.orders.get(orderId)?.status).toBe("confirmado");
  });

  it("rechaza con ForbiddenError si el pedido es de otro cliente", async () => {
    await expect(ctx.service.cancelOrder(orderId, "user-2", "cliente")).rejects.toThrow(
      ForbiddenError,
    );
    expect(ctx.productRepository.stockOf("p1")).toBe(5);
    expect(ctx.orderRepository.orders.get(orderId)?.status).toBe("pendiente");
  });

  it("devuelve null si la orden no existe", async () => {
    expect(await ctx.service.cancelOrder("order-inexistente", "user-1", "cliente")).toBeNull();
  });

  // El owner no tiene perfil de cliente y puede cancelar pedidos ya avanzados.
  it("el owner cancela un pedido en preparacion y repone el stock", async () => {
    await ctx.service.changeStatus(orderId, "confirmado");
    await ctx.service.changeStatus(orderId, "en_preparacion");

    const order = await ctx.service.cancelOrder(orderId, "user-owner", "owner");

    expect(order?.status).toBe("cancelado");
    expect(ctx.productRepository.stockOf("p1")).toBe(8);
  });

  it("el owner no puede cancelar un pedido entregado, sin reponer stock", async () => {
    const pasos: OrderStatus[] = [
      "confirmado",
      "en_preparacion",
      "listo_para_retirar",
      "entregado",
    ];
    for (const status of pasos) {
      await ctx.service.changeStatus(orderId, status);
    }

    await expect(ctx.service.cancelOrder(orderId, "user-owner", "owner")).rejects.toThrow(
      "No se puede cancelar un pedido ya entregado",
    );
    expect(ctx.productRepository.stockOf("p1")).toBe(5);
    expect(ctx.orderRepository.orders.get(orderId)?.status).toBe("entregado");
  });

  // Cancelar dos veces repondria el stock dos veces.
  it("el owner no puede cancelar un pedido ya cancelado, sin reponer stock otra vez", async () => {
    await ctx.service.cancelOrder(orderId, "user-owner", "owner");

    await expect(ctx.service.cancelOrder(orderId, "user-owner", "owner")).rejects.toThrow(
      "El pedido ya está cancelado",
    );
    expect(ctx.productRepository.stockOf("p1")).toBe(8);
  });

  it("al cancelar repone el stock una sola vez", async () => {
    const increment = jest.spyOn(ctx.productRepository, "incrementStock");

    await ctx.service.cancelOrder(orderId, "user-1", "cliente");

    expect(increment).toHaveBeenCalledTimes(1);
    expect(increment).toHaveBeenCalledWith("p1", 3);
    expect(ctx.productRepository.stockOf("p1")).toBe(8);
  });

  // Otro request cambia el estado entre el chequeo previo y la escritura: updateStatusIf
  // devuelve null, no se repone stock y el error depende del estado en que quedo.
  it.each([
    {
      role: "owner",
      userId: "user-owner",
      previo: [],
      ahora: "cancelado" as OrderStatus,
      mensaje: "El pedido ya está cancelado",
    },
    {
      role: "owner",
      userId: "user-owner",
      previo: ["confirmado", "en_preparacion", "listo_para_retirar"] as OrderStatus[],
      ahora: "entregado" as OrderStatus,
      mensaje: "No se puede cancelar un pedido ya entregado",
    },
    {
      role: "cliente",
      userId: "user-1",
      previo: [],
      ahora: "confirmado" as OrderStatus,
      mensaje: "Solo se puede cancelar un pedido pendiente",
    },
    {
      role: "cliente",
      userId: "user-1",
      previo: [],
      ahora: "cancelado" as OrderStatus,
      mensaje: "Solo se puede cancelar un pedido pendiente",
    },
  ])(
    "$role: si el pedido pasa a '$ahora' durante la cancelacion, no repone stock",
    async ({ role, userId, previo, ahora, mensaje }) => {
      for (const status of previo) {
        await ctx.service.changeStatus(orderId, status);
      }
      ctx.orderRepository.beforeUpdateIf = (order) => {
        order.status = ahora;
      };
      const increment = jest.spyOn(ctx.productRepository, "incrementStock");

      await expect(ctx.service.cancelOrder(orderId, userId, role)).rejects.toThrow(
        new ValidationError(mensaje),
      );
      expect(increment).not.toHaveBeenCalled();
      expect(ctx.productRepository.stockOf("p1")).toBe(5);
      expect(ctx.orderRepository.orders.get(orderId)?.status).toBe(ahora);
    },
  );

  // Regresion: cuatro cancelaciones simultaneas respondian todas OK y reponian el stock
  // cuatro veces. Todas leen "pendiente" antes de que alguna escriba.
  it.each([
    ["cliente", "user-1"],
    ["owner", "user-owner"],
  ])("de cuatro cancelaciones simultaneas (%s) solo una repone stock", async (role, userId) => {
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => ctx.service.cancelOrder(orderId, userId, role)),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected).toHaveLength(3);
    for (const r of rejected) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(ValidationError);
    }
    expect(ctx.productRepository.stockOf("p1")).toBe(8);
    expect(ctx.orderRepository.orders.get(orderId)?.status).toBe("cancelado");
  });
});

describe("OrderService.getById", () => {
  let ctx: Context;
  let orderId: string;

  beforeEach(async () => {
    ctx = setup();
    const order = await ctx.service.createOrder("user-1", "cliente", {
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
