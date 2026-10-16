import { Pool } from "pg";
import type { PoolClient } from "pg";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { OrderRepositoryPostgres } from "../../src/order/order.repository.postgres";
import { CustomerRepositoryPostgres } from "../../src/customer/customer.repository.postgres";
import { validNewCustomer, validNewOrder } from "../fixtures";

describe("OrderRepositoryPostgres — integración con BD real", () => {
  let pool: Pool;
  let repository: OrderRepositoryPostgres;
  let customerRepository: CustomerRepositoryPostgres;
  let client: PoolClient | undefined;
  let container: StartedPostgreSqlContainer | undefined;
  let customerId: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:15-alpine")
      .withDatabase("tiendabox_test")
      .withStartupTimeout(120_000)
      .start();
    pool = new Pool({
      connectionString: container.getConnectionUri(),
      connectionTimeoutMillis: 5000,
      query_timeout: 5000,
    });
    // El esquema real de produccion: si se escribiera a mano, el test dejaria de probarlo.
    const schema = await readFile(resolve(__dirname, "../../src/db/sql/init.sql"), "utf8");
    await pool.query(schema);
  }, 180_000);

  // Cada test corre en una transaccion que se descarta al final: la base arranca limpia
  // sin tener que recrear el contenedor.
  beforeEach(async () => {
    client = await pool.connect();
    await client.query("BEGIN");
    repository = new OrderRepositoryPostgres(client);
    customerRepository = new CustomerRepositoryPostgres(client);
    // orders.customer_id tiene FK a customers.
    customerId = (await customerRepository.create(validNewCustomer)).id;
  });

  afterEach(async () => {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } finally {
        client.release();
        client = undefined;
      }
    }
  });

  afterAll(async () => {
    try {
      if (pool) await pool.end();
    } finally {
      if (container) await container.stop();
    }
  }, 60_000);

  // created_at usa DEFAULT NOW(), y dentro de una transaccion NOW() es siempre la hora de
  // inicio: todas las ordenes de un test quedarian con la misma fecha. Para probar el
  // orden, se fija a mano.
  async function setCreatedAt(orderId: string, createdAt: string): Promise<void> {
    await client!.query("UPDATE orders SET created_at = $1 WHERE id = $2", [createdAt, orderId]);
  }

  it("create guarda la orden y sus items, y getById los devuelve completos", async () => {
    const data = {
      ...validNewOrder,
      customer_id: customerId,
      delivery_type: "envio",
      delivery_address: "Av. Siempreviva 742",
      total: 250,
      items: [
        { product_id: "p1", product_name: "Teclado", unit_price: 100, quantity: 2, type: "stock" },
        { product_id: "p2", product_name: "Mouse", unit_price: 50, quantity: 1, type: "stock" },
      ],
    };

    const created = await repository.create(data);
    const found = await repository.getById(created.id);

    expect(typeof created.id).toBe("string");
    expect(found).toMatchObject({
      id: created.id,
      customer_id: customerId,
      status: "pendiente",
      delivery_type: "envio",
      delivery_address: "Av. Siempreviva 742",
      total: 250,
    });
    expect(found!.items).toHaveLength(2);
    // Los items de create ya traen su id: tienen que volver iguales desde la base.
    expect(found!.items).toEqual(expect.arrayContaining(created.items));
  });

  it("getById devuelve null para una orden inexistente", async () => {
    await expect(repository.getById("no-existe")).resolves.toBeNull();
  });

  // Regla central del pedido: el precio se copia al item al comprar. Si despues el producto
  // cambia de precio, los pedidos ya hechos conservan el que se pago.
  it("congela el precio de los items: un pedido posterior a otro precio no lo modifica", async () => {
    const first = await repository.create({ ...validNewOrder, customer_id: customerId });
    await repository.create({
      ...validNewOrder,
      customer_id: customerId,
      total: 300,
      items: [{ ...validNewOrder.items[0]!, unit_price: 150 }],
    });
    await repository.updateStatus(first.id, "confirmado");

    const found = await repository.getById(first.id);

    expect(found!.items[0]!.unit_price).toBe(100);
    expect(found!.items[0]!.product_name).toBe("Teclado");
    expect(found!.total).toBe(200);
  });

  // Los productos por encargo no tienen precio: null significa "a cotizar", no gratis.
  it("un item con unit_price null se guarda y recupera como null, no como 0", async () => {
    const created = await repository.create({
      ...validNewOrder,
      customer_id: customerId,
      total: 0,
      items: [
        {
          product_id: "p-enc",
          product_name: "Notebook",
          unit_price: null,
          quantity: 1,
          type: "encargo",
        },
      ],
    });

    const found = await repository.getById(created.id);

    expect(found!.items[0]!.unit_price).toBeNull();
    expect(found!.items[0]!.type).toBe("encargo");
  });

  it("getByCustomerId devuelve solo las órdenes de ese cliente, de la más nueva a la más vieja", async () => {
    const otherCustomerId = (await customerRepository.create(validNewCustomer)).id;
    const oldest = await repository.create({ ...validNewOrder, customer_id: customerId });
    const newest = await repository.create({ ...validNewOrder, customer_id: customerId });
    const middle = await repository.create({ ...validNewOrder, customer_id: customerId });
    const foreign = await repository.create({ ...validNewOrder, customer_id: otherCustomerId });
    await setCreatedAt(oldest.id, "2026-01-01 10:00:00");
    await setCreatedAt(middle.id, "2026-02-01 10:00:00");
    await setCreatedAt(newest.id, "2026-03-01 10:00:00");
    await setCreatedAt(foreign.id, "2026-04-01 10:00:00");

    const orders = await repository.getByCustomerId(customerId);

    expect(orders.map((order) => order.id)).toEqual([newest.id, middle.id, oldest.id]);
    expect(orders.every((order) => order.items.length === 1)).toBe(true);
  });

  it("getAll con filtro de estado devuelve solo las de ese estado", async () => {
    const pending = await repository.create({ ...validNewOrder, customer_id: customerId });
    const confirmed = await repository.create({ ...validNewOrder, customer_id: customerId });
    const cancelled = await repository.create({ ...validNewOrder, customer_id: customerId });
    await repository.updateStatus(confirmed.id, "confirmado");
    await repository.updateStatus(cancelled.id, "cancelado");

    const onlyConfirmed = await repository.getAll("confirmado");
    const all = await repository.getAll();

    expect(onlyConfirmed.map((order) => order.id)).toEqual([confirmed.id]);
    expect(all.map((order) => order.id).sort()).toEqual(
      [pending.id, confirmed.id, cancelled.id].sort(),
    );
  });

  it("updateStatus cambia el estado y devuelve la orden actualizada con sus items", async () => {
    const created = await repository.create({ ...validNewOrder, customer_id: customerId });

    const updated = await repository.updateStatus(created.id, "en_preparacion");

    expect(updated).toMatchObject({ id: created.id, status: "en_preparacion", total: 200 });
    expect(updated!.items).toHaveLength(1);
    await expect(repository.getById(created.id)).resolves.toMatchObject({
      status: "en_preparacion",
    });
    await expect(repository.updateStatus("no-existe", "confirmado")).resolves.toBeNull();
  });

  // total es NUMERIC(12,2): con un float de JS se perderian centavos.
  it("guarda totales y precios con decimales sin perder precisión", async () => {
    const created = await repository.create({
      ...validNewOrder,
      customer_id: customerId,
      total: 1234.56,
      items: [{ ...validNewOrder.items[0]!, unit_price: 617.28, quantity: 2 }],
    });

    const found = await repository.getById(created.id);

    expect(found!.total).toBe(1234.56);
    expect(found!.items[0]!.unit_price).toBe(617.28);
  });
});
