import { Pool } from "pg";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { AuthService } from "../../src/auth/auth.service";
import { createRegistrationTransaction } from "../../src/db/database-provider.factory";
import { withTransaction } from "../../src/db/transaction";
import { UserRepositoryPostgres } from "../../src/user/user.repository.postgres";
import { CustomerRepositoryPostgres } from "../../src/customer/customer.repository.postgres";
import { SessionRepositoryPostgres } from "../../src/session/session.repository.postgres";
import { validRegistration } from "../fixtures";

// Prueba el alta de cuentas de punta a punta contra Postgres real: que usuario y cliente se
// confirmen juntos o ninguno. A diferencia de los tests de repositorios, aca no se puede
// envolver cada test en BEGIN/ROLLBACK: withTransaction toma su propia conexion del pool y
// hace COMMIT de verdad. Por eso las tablas se limpian en afterEach.
describe("Alta de cuentas (AuthService.register) — integración con BD real", () => {
  let pool: Pool;
  let service: AuthService;
  let container: StartedPostgreSqlContainer | undefined;

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
    service = new AuthService(
      new UserRepositoryPostgres(pool),
      new CustomerRepositoryPostgres(pool),
      new SessionRepositoryPostgres(pool),
      createRegistrationTransaction(pool),
    );
  }, 180_000);

  // Conserva el owner que siembra init.sql.
  afterEach(async () => {
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

  async function countUsersWithEmail(email: string): Promise<number> {
    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM users WHERE email = $1", [
      email,
    ]);
    return rows[0].n;
  }

  it("confirma el usuario y el cliente vinculados, y la cuenta puede entrar", async () => {
    const result = await service.register(validRegistration);

    // Se leen con otra conexion del pool: si la transaccion no hubiera hecho COMMIT, no se verian.
    const { rows } = await pool.query(
      "SELECT c.name, u.email FROM customers c JOIN users u ON u.id = c.user_id WHERE u.id = $1",
      [result.user.id],
    );
    expect(rows).toEqual([{ name: "Maria Gomez", email: "maria@example.com" }]);
    await expect(
      service.login({ email: validRegistration.email, password: validRegistration.password }),
    ).resolves.toMatchObject({ customer_id: result.customer.id });
  });

  // Regresion con un disparador real: register no limita el largo del nombre, pero la
  // columna customers.name es VARCHAR(150). El usuario se insertaba, el cliente fallaba y
  // quedaba una cuenta sin perfil con el email tomado.
  it("si falla el insert del cliente no queda el usuario y el email sigue libre", async () => {
    await expect(
      service.register({ ...validRegistration, name: "a".repeat(151) }),
    ).rejects.toMatchObject({ code: "22001" }); // string_data_right_truncation

    expect(await countUsersWithEmail(validRegistration.email)).toBe(0);
    await expect(service.register(validRegistration)).resolves.toBeDefined();
    expect(await countUsersWithEmail(validRegistration.email)).toBe(1);
  });

  it("entra con un password que tiene espacios en los extremos", async () => {
    await service.register({ ...validRegistration, password: "  secreto123  " });

    await expect(
      service.login({ email: validRegistration.email, password: "  secreto123  " }),
    ).resolves.toMatchObject({ email: validRegistration.email });
  });

  describe("withTransaction", () => {
    it("deshace todo lo escrito si el trabajo lanza, y propaga el error", async () => {
      const error = new Error("fallo a mitad de la transacción");

      await expect(
        withTransaction(pool, async (client) => {
          await new UserRepositoryPostgres(client).create({
            email: "tx@example.com",
            password: "secreto123",
            role: "cliente",
          });
          throw error;
        }),
      ).rejects.toBe(error);

      expect(await countUsersWithEmail("tx@example.com")).toBe(0);
    });

    // Si la conexion volviera al pool con la transaccion abierta, el proximo que la tome
    // seguiria dentro de ella.
    it("devuelve la conexión al pool sin transacciones abiertas", async () => {
      await withTransaction(pool, async () => {
        throw new Error("fallo");
      }).catch(() => undefined);
      await withTransaction(pool, async () => "ok");

      expect(pool.totalCount).toBeGreaterThan(0);
      expect(pool.idleCount).toBe(pool.totalCount);
      const { rows } = await pool.query(
        "SELECT COUNT(*)::int AS n FROM pg_stat_activity WHERE state = 'idle in transaction'",
      );
      expect(rows[0].n).toBe(0);
    });

    // El caso real en que falla el ROLLBACK: la base corta la conexion a mitad de la
    // transaccion. pg emite 'error' en el client y, como el pool le saca su listener
    // mientras esta prestado, sin un listener propio ese error tiraria abajo el proceso.
    it("si se corta la conexión, propaga el error, descarta la conexión y el proceso sigue vivo", async () => {
      const error = new Error("fallo después de perder la conexión");
      let discardedPid: number | undefined;

      await expect(
        withTransaction(pool, async (client) => {
          await new UserRepositoryPostgres(client).create({
            email: "cortada@example.com",
            password: "secreto123",
            role: "cliente",
          });
          const { rows } = await client.query("SELECT pg_backend_pid() AS pid");
          discardedPid = rows[0].pid;
          // Se suscribe antes de cortar, para no perder el evento si llega rapido.
          const ended = new Promise((resolve) => client.once("end", resolve));
          await pool.query("SELECT pg_terminate_backend($1)", [discardedPid]);
          await ended;
          throw error;
        }),
      ).rejects.toBe(error);

      // Lo escrito antes del corte no se confirmo, y el pool sigue funcionando con
      // conexiones nuevas: la cortada no volvio al pool.
      expect(await countUsersWithEmail("cortada@example.com")).toBe(0);
      const { rows } = await pool.query("SELECT pg_backend_pid() AS pid");
      expect(rows[0].pid).not.toBe(discardedPid);
    });
  });
});
