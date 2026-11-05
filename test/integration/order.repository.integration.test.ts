import { Pool } from "pg";
import type { PoolClient } from "pg";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { OrderRepositoryPostgres } from "../../src/order/order.repository.postgres";
import { CustomerRepositoryPostgres } from "../../src/customer/customer.repository.postgres";
import { UserRepositoryPostgres } from "../../src/user/user.repository.postgres";
import { SessionRepositoryPostgres } from "../../src/session/session.repository.postgres";
import { CartRepositoryPostgres } from "../../src/cart/cart.repository.postgres";
import { validNewCustomer, validNewOrder, validUser } from "../fixtures";

// Fecha ISO 8601 en UTC con milisegundos, como la devuelven todos los repos Postgres.
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe("OrderRepositoryPostgres — integración con BD real", () => {
  let pool: Pool;
  let schema: string;
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
    schema = await readFile(resolve(__dirname, "../../src/db/sql/init.sql"), "utf8");
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
    await repository.updateStatusIf(first.id, ["pendiente"], "confirmado");

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
    await repository.updateStatusIf(confirmed.id, ["pendiente"], "confirmado");
    await repository.updateStatusIf(cancelled.id, ["pendiente"], "cancelado");

    const onlyConfirmed = await repository.getAll("confirmado");
    const all = await repository.getAll();

    expect(onlyConfirmed.map((order) => order.id)).toEqual([confirmed.id]);
    expect(all.map((order) => order.id).sort()).toEqual(
      [pending.id, confirmed.id, cancelled.id].sort(),
    );
  });

  it("updateStatusIf cambia el estado si el actual está en `from` y devuelve la orden con sus items", async () => {
    const created = await repository.create({ ...validNewOrder, customer_id: customerId });

    const updated = await repository.updateStatusIf(
      created.id,
      ["pendiente", "confirmado"],
      "en_preparacion",
    );

    expect(updated).toMatchObject({ id: created.id, status: "en_preparacion", total: 200 });
    expect(updated!.items).toEqual(created.items);
    await expect(repository.getById(created.id)).resolves.toMatchObject({
      status: "en_preparacion",
    });
  });

  it("updateStatusIf devuelve null y no toca la orden si el estado actual no está en `from`", async () => {
    const created = await repository.create({ ...validNewOrder, customer_id: customerId });
    await repository.updateStatusIf(created.id, ["pendiente"], "cancelado");

    const result = await repository.updateStatusIf(
      created.id,
      ["pendiente", "confirmado"],
      "en_preparacion",
    );

    expect(result).toBeNull();
    await expect(repository.getById(created.id)).resolves.toMatchObject({ status: "cancelado" });
  });

  it("updateStatusIf devuelve null para una orden inexistente", async () => {
    await expect(
      repository.updateStatusIf("no-existe", ["pendiente"], "confirmado"),
    ).resolves.toBeNull();
  });

  // Prueba del arreglo de la cancelacion concurrente: cuatro PUT /cancel simultaneos
  // respondian 200 y reponian el stock cuatro veces.
  // Corre por fuera de la transaccion del test: con un unico PoolClient las consultas se
  // encolan una detras de otra y no habria concurrencia real. Con el pool, cada llamada
  // toma su propia conexion y los cinco UPDATE compiten por la misma fila. Por eso los
  // datos se confirman y se borran a mano al final.
  it("de 5 updateStatusIf simultáneos sobre el mismo pedido, exactamente uno lo cambia", async () => {
    const poolRepository = new OrderRepositoryPostgres(pool);
    const customer = await new CustomerRepositoryPostgres(pool).create(validNewCustomer);
    const order = await poolRepository.create({ ...validNewOrder, customer_id: customer.id });

    try {
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          poolRepository.updateStatusIf(order.id, ["pendiente"], "cancelado"),
        ),
      );

      const ganadores = results.filter((result) => result !== null);
      expect(ganadores).toHaveLength(1);
      expect(ganadores[0]).toMatchObject({ id: order.id, status: "cancelado" });
      expect(results.filter((result) => result === null)).toHaveLength(4);
      await expect(poolRepository.getById(order.id)).resolves.toMatchObject({
        status: "cancelado",
      });
    } finally {
      await pool.query("DELETE FROM order_items WHERE order_id = $1", [order.id]);
      await pool.query("DELETE FROM orders WHERE id = $1", [order.id]);
      await pool.query("DELETE FROM customers WHERE id = $1", [customer.id]);
    }
  });

  // Regresion: created_at salia como "2026-11-05 21:14:10", sin zona, y el front lo leia
  // como hora argentina: corria los pedidos tres horas.
  it("created_at sale en ISO 8601 con Z y corresponde al momento de la creación", async () => {
    const created = await repository.create({ ...validNewOrder, customer_id: customerId });
    const found = await repository.getById(created.id);

    for (const createdAt of [created.created_at, found!.created_at]) {
      expect(createdAt).toMatch(ISO_UTC);
      expect(Math.abs(new Date(createdAt).getTime() - Date.now())).toBeLessThan(60_000);
    }
  });

  describe("migración de fechas a TIMESTAMPTZ (init.sql)", () => {
    const DATE_COLUMNS = [
      ["users", "created_at"],
      ["customers", "created_at"],
      ["sessions", "created_at"],
      ["carts", "updated_at"],
      ["orders", "created_at"],
    ] as const;

    async function columnTypes(): Promise<string[]> {
      const types: string[] = [];
      for (const [table, column] of DATE_COLUMNS) {
        const { rows } = await client!.query(
          `SELECT data_type FROM information_schema.columns
           WHERE table_name = $1 AND column_name = $2`,
          [table, column],
        );
        types.push(rows[0].data_type);
      }
      return types;
    }

    // Valor exacto de cada fecha, tal como lo guarda la base.
    async function dateValues(): Promise<string[]> {
      const values: string[] = [];
      for (const [table, column] of DATE_COLUMNS) {
        const { rows } = await client!.query(
          `SELECT ${column}::text AS value FROM ${table} ORDER BY 1`,
        );
        values.push(...rows.map((row) => `${table}.${column}=${row.value}`));
      }
      return values;
    }

    // El DDL de Postgres es transaccional: el ROLLBACK del afterEach deshace todo.
    it("correr init.sql dos veces seguidas no cambia los valores", async () => {
      const user = await new UserRepositoryPostgres(client!).create(validUser);
      await new SessionRepositoryPostgres(client!).create(user.id);
      await new CartRepositoryPostgres(client!).createForCustomer(customerId);
      await repository.create({ ...validNewOrder, customer_id: customerId });
      const before = await dateValues();
      expect(before.length).toBeGreaterThanOrEqual(5);

      await client!.query(schema);
      await client!.query(schema);

      expect(await dateValues()).toEqual(before);
      expect(await columnTypes()).toEqual(Array(5).fill("timestamp with time zone"));
    });

    // Una base creada con el esquema viejo (TIMESTAMP sin zona) guardaba la hora UTC del
    // contenedor. Al convertir, ese valor se interpreta en la zona de la sesion (UTC, como
    // en docker-compose), asi que el instante se conserva.
    it("convierte las columnas de una base vieja sin mover el instante guardado", async () => {
      for (const [table, column] of DATE_COLUMNS) {
        await client!.query(`ALTER TABLE ${table} ALTER COLUMN ${column} TYPE TIMESTAMP`);
      }
      const order = await repository.create({ ...validNewOrder, customer_id: customerId });
      await client!.query(
        "UPDATE orders SET created_at = '2026-11-05 21:14:10.223' WHERE id = $1",
        [order.id],
      );

      await client!.query(schema);

      expect(await columnTypes()).toEqual(Array(5).fill("timestamp with time zone"));
      await expect(repository.getById(order.id)).resolves.toMatchObject({
        created_at: "2026-11-05T21:14:10.223Z",
      });
    });
  });

  it("existsForCustomer indica si el cliente tiene algún pedido, en cualquier estado", async () => {
    const otherCustomerId = (await customerRepository.create(validNewCustomer)).id;
    const order = await repository.create({ ...validNewOrder, customer_id: customerId });
    await repository.updateStatusIf(order.id, ["pendiente"], "cancelado");

    await expect(repository.existsForCustomer(customerId)).resolves.toBe(true);
    await expect(repository.existsForCustomer(otherCustomerId)).resolves.toBe(false);
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
