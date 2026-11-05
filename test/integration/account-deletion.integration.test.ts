import { Pool } from "pg";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { CustomerService } from "../../src/customer/customer.service";
import { UserService } from "../../src/user/user.service";
import { createRunInTransaction } from "../../src/db/database-provider.factory";
import { UserRepositoryPostgres } from "../../src/user/user.repository.postgres";
import { CustomerRepositoryPostgres } from "../../src/customer/customer.repository.postgres";
import { SessionRepositoryPostgres } from "../../src/session/session.repository.postgres";
import { CartRepositoryPostgres } from "../../src/cart/cart.repository.postgres";
import { OrderRepositoryPostgres } from "../../src/order/order.repository.postgres";
import { ConflictError } from "../../src/errors";
import { validNewCustomer, validNewOrder, validUser } from "../fixtures";

// Prueba los borrados de punta a punta contra Postgres real: que respeten las claves
// foraneas (antes respondian 500) y que no dejen filas sueltas. Como el alta de cuentas,
// usa la transaccion real, que toma su propia conexion y hace COMMIT: no se puede envolver
// cada test en BEGIN/ROLLBACK, asi que las tablas se limpian en afterEach.
describe("Borrado de clientes y usuarios — integración con BD real", () => {
  let pool: Pool;
  let container: StartedPostgreSqlContainer | undefined;
  let users: UserRepositoryPostgres;
  let customers: CustomerRepositoryPostgres;
  let sessions: SessionRepositoryPostgres;
  let carts: CartRepositoryPostgres;
  let orders: OrderRepositoryPostgres;
  let customerService: CustomerService;
  let userService: UserService;

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

    // Mismo armado que app.ts, con los repositorios sobre el pool.
    users = new UserRepositoryPostgres(pool);
    customers = new CustomerRepositoryPostgres(pool);
    sessions = new SessionRepositoryPostgres(pool);
    carts = new CartRepositoryPostgres(pool);
    orders = new OrderRepositoryPostgres(pool);
    const runInTransaction = createRunInTransaction(pool);
    customerService = new CustomerService(customers, users, runInTransaction);
    userService = new UserService(users, customers, runInTransaction);
  }, 180_000);

  // Conserva el owner que siembra init.sql. El orden respeta las claves foraneas.
  afterEach(async () => {
    await pool.query("DELETE FROM order_items");
    await pool.query("DELETE FROM orders");
    await pool.query("DELETE FROM cart_items");
    await pool.query("DELETE FROM carts");
    await pool.query("DELETE FROM sessions");
    await pool.query("DELETE FROM customers");
    await pool.query("DELETE FROM users WHERE email <> 'admin@tiendabox.com'");
  });

  afterAll(async () => {
    try {
      if (pool) await pool.end();
    } finally {
      if (container) await container.stop();
    }
  }, 60_000);

  // Cliente con carrito de dos items; con email, tambien con cuenta web y dos sesiones.
  async function seedCustomer(email?: string) {
    const user = email ? await users.create({ ...validUser, email }) : null;
    const customer = await customers.create({ ...validNewCustomer, user_id: user?.id ?? null });
    const cart = await carts.createForCustomer(customer.id);
    await carts.addItem(cart.id, "p1", 1);
    await carts.addItem(cart.id, "p2", 3);
    if (user) {
      await sessions.create(user.id);
      await sessions.create(user.id);
    }
    return { user, customer, cart };
  }

  // Filas que quedan en cada tabla para ese cliente y su cuenta.
  async function rowsOf(customerId: string, userId: string | null) {
    const count = async (sql: string, param: string | null) =>
      Number((await pool.query(sql, [param])).rows[0].count);
    return {
      cart_items: await count(
        "SELECT COUNT(*) FROM cart_items ci JOIN carts c ON c.id = ci.cart_id WHERE c.customer_id = $1",
        customerId,
      ),
      carts: await count("SELECT COUNT(*) FROM carts WHERE customer_id = $1", customerId),
      customers: await count("SELECT COUNT(*) FROM customers WHERE id = $1", customerId),
      sessions: await count("SELECT COUNT(*) FROM sessions WHERE user_id = $1", userId),
      users: await count("SELECT COUNT(*) FROM users WHERE id = $1", userId),
    };
  }

  const NOTHING_LEFT = { cart_items: 0, carts: 0, customers: 0, sessions: 0, users: 0 };

  describe("CustomerService.delete", () => {
    it("borrar un cliente con carrito y cuenta deja vacías todas sus filas", async () => {
      const { user, customer } = await seedCustomer("maria@example.com");
      const other = await seedCustomer("otro@example.com");

      await expect(customerService.delete(customer.id)).resolves.toBe(true);

      await expect(rowsOf(customer.id, user!.id)).resolves.toEqual(NOTHING_LEFT);
      // El otro cliente queda intacto.
      await expect(rowsOf(other.customer.id, other.user!.id)).resolves.toEqual({
        cart_items: 2,
        carts: 1,
        customers: 1,
        sessions: 2,
        users: 1,
      });
      // El email quedo libre para una cuenta nueva.
      await expect(users.getByEmail("maria@example.com")).resolves.toBeNull();
    });

    it("un cliente de mostrador con carrito se borra sin tocar usuarios", async () => {
      const { customer } = await seedCustomer();
      const usersBefore = (await users.getAll()).length;

      await expect(customerService.delete(customer.id)).resolves.toBe(true);

      await expect(rowsOf(customer.id, null)).resolves.toMatchObject({
        cart_items: 0,
        carts: 0,
        customers: 0,
      });
      expect(await users.getAll()).toHaveLength(usersBefore);
    });

    // Regresion: respondia 500 por la clave foranea de orders.customer_id.
    it("con un pedido falla con el error de negocio y no borra nada", async () => {
      const { user, customer } = await seedCustomer("maria@example.com");
      await orders.create({ ...validNewOrder, customer_id: customer.id });

      const deletion = customerService.delete(customer.id);

      await expect(deletion).rejects.toThrow(ConflictError);
      await expect(deletion).rejects.toThrow(
        "No se puede eliminar un cliente con pedidos registrados",
      );
      await expect(rowsOf(customer.id, user!.id)).resolves.toEqual({
        cart_items: 2,
        carts: 1,
        customers: 1,
        sessions: 2,
        users: 1,
      });
    });

    it("devuelve false si el cliente no existe", async () => {
      await expect(customerService.delete("no-existe")).resolves.toBe(false);
    });
  });

  describe("UserService.delete", () => {
    const requesterId = "owner-que-pide";

    // Antes daba 500 si el usuario tenia sesiones abiertas (FK de sessions.user_id).
    it("borra un usuario sin perfil de cliente junto con sus sesiones", async () => {
      const user = await users.create({ ...validUser, email: "owner2@example.com", role: "owner" });
      await sessions.create(user.id);

      await expect(userService.delete(user.id, requesterId)).resolves.toBe(true);

      await expect(users.getById(user.id)).resolves.toBeNull();
      const { rows } = await pool.query("SELECT COUNT(*) FROM sessions WHERE user_id = $1", [
        user.id,
      ]);
      expect(Number(rows[0].count)).toBe(0);
    });

    // Regresion: respondia 500 por la clave foranea de customers.user_id.
    it("rechaza un usuario con perfil de cliente y no borra nada", async () => {
      const { user, customer } = await seedCustomer("maria@example.com");

      await expect(userService.delete(user!.id, requesterId)).rejects.toThrow(
        "Este usuario es un cliente: eliminalo desde Clientes",
      );
      await expect(rowsOf(customer.id, user!.id)).resolves.toMatchObject({
        customers: 1,
        sessions: 2,
        users: 1,
      });
    });
  });
});
