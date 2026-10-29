import { Pool } from "pg";
import type { PoolClient } from "pg";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { CartRepositoryPostgres } from "../../src/cart/cart.repository.postgres";
import { CustomerRepositoryPostgres } from "../../src/customer/customer.repository.postgres";
import { validNewCustomer } from "../fixtures";

describe("CartRepositoryPostgres — integración con BD real", () => {
  let pool: Pool;
  let repository: CartRepositoryPostgres;
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
    repository = new CartRepositoryPostgres(client);
    // carts.customer_id tiene FK a customers.
    customerId = (await new CustomerRepositoryPostgres(client).create(validNewCustomer)).id;
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

  // Un error de SQL aborta la transaccion entera. El savepoint deja seguir usandola despues
  // de una operacion que se espera que falle, y devuelve el error para inspeccionarlo.
  async function expectDbError(operation: () => Promise<unknown>): Promise<{ code?: string }> {
    await client!.query("SAVEPOINT antes_del_error");
    try {
      await operation();
    } catch (error) {
      await client!.query("ROLLBACK TO SAVEPOINT antes_del_error");
      return error as { code?: string };
    }
    throw new Error("Se esperaba que la operación fallara en la base");
  }

  it("createForCustomer crea un carrito vacío que getByCustomerId encuentra", async () => {
    const cart = await repository.createForCustomer(customerId);

    expect(cart).toMatchObject({ customer_id: customerId, items: [] });
    expect(typeof cart.id).toBe("string");
    await expect(repository.getByCustomerId(customerId)).resolves.toEqual(cart);
  });

  it("getByCustomerId devuelve null si el cliente no tiene carrito", async () => {
    await expect(repository.getByCustomerId(customerId)).resolves.toBeNull();
  });

  // Un unico carrito activo por cliente (UNIQUE sobre customer_id).
  it("rechaza un segundo carrito para el mismo cliente", async () => {
    await repository.createForCustomer(customerId);

    const error = await expectDbError(() => repository.createForCustomer(customerId));

    expect(error.code).toBe("23505"); // unique_violation
  });

  it("addItem, updateItemQuantity y removeItem funcionan en secuencia", async () => {
    const { id: cartId } = await repository.createForCustomer(customerId);

    await repository.addItem(cartId, "p1", 2);
    await repository.addItem(cartId, "p2", 1);
    await repository.updateItemQuantity(cartId, "p1", 5);
    const removed = await repository.removeItem(cartId, "p2");
    const removedAgain = await repository.removeItem(cartId, "p2");

    const cart = await repository.getByCustomerId(customerId);
    expect(cart!.items).toEqual([{ id: expect.any(String), product_id: "p1", quantity: 5 }]);
    expect(removed).toBe(true);
    expect(removedAgain).toBe(false);
  });

  // Un producto no puede aparecer dos veces en el mismo carrito: se suma con updateItemQuantity.
  it("rechaza agregar dos veces el mismo producto al carrito", async () => {
    const { id: cartId } = await repository.createForCustomer(customerId);
    await repository.addItem(cartId, "p1", 2);

    const error = await expectDbError(() => repository.addItem(cartId, "p1", 1));

    expect(error.code).toBe("23505"); // unique_violation
    const cart = await repository.getByCustomerId(customerId);
    expect(cart!.items).toEqual([expect.objectContaining({ product_id: "p1", quantity: 2 })]);
  });

  it("clear vacía los items pero no borra el carrito", async () => {
    const created = await repository.createForCustomer(customerId);
    await repository.addItem(created.id, "p1", 2);
    await repository.addItem(created.id, "p2", 1);

    await repository.clear(created.id);

    const cart = await repository.getByCustomerId(customerId);
    expect(cart).not.toBeNull();
    expect(cart!.id).toBe(created.id);
    expect(cart!.items).toEqual([]);
  });

  it.each([0, -1])("la restricción CHECK rechaza una cantidad de %i", async (quantity) => {
    const { id: cartId } = await repository.createForCustomer(customerId);
    await repository.addItem(cartId, "p1", 2);

    const onAdd = await expectDbError(() => repository.addItem(cartId, "p2", quantity));
    const onUpdate = await expectDbError(() =>
      repository.updateItemQuantity(cartId, "p1", quantity),
    );

    expect(onAdd.code).toBe("23514"); // check_violation
    expect(onUpdate.code).toBe("23514");
    const cart = await repository.getByCustomerId(customerId);
    expect(cart!.items).toEqual([expect.objectContaining({ product_id: "p1", quantity: 2 })]);
  });
});
