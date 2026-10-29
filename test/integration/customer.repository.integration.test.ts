import { Pool } from "pg";
import type { PoolClient } from "pg";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { CustomerRepositoryPostgres } from "../../src/customer/customer.repository.postgres";
import { UserRepositoryPostgres } from "../../src/user/user.repository.postgres";
import { validNewCustomer, validUser } from "../fixtures";

describe("CustomerRepositoryPostgres — integración con BD real", () => {
  let pool: Pool;
  let schema: string;
  let repository: CustomerRepositoryPostgres;
  let userRepository: UserRepositoryPostgres;
  let client: PoolClient | undefined;
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
    schema = await readFile(resolve(__dirname, "../../src/db/sql/init.sql"), "utf8");
    await pool.query(schema);
  }, 180_000);

  // Cada test corre en una transaccion que se descarta al final: la base arranca limpia
  // sin tener que recrear el contenedor.
  beforeEach(async () => {
    client = await pool.connect();
    await client.query("BEGIN");
    repository = new CustomerRepositoryPostgres(client);
    userRepository = new UserRepositoryPostgres(client);
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

  it("guarda y recupera todos los datos con un ID string", async () => {
    const data = { ...validNewCustomer, government_id: "30123456", phone: "3411234567" };

    const saved = await repository.create(data);
    const found = await repository.getById(saved.id);

    expect(typeof saved.id).toBe("string");
    expect(saved.id.length).toBeGreaterThan(0);
    expect(found).toEqual(saved);
    expect(found).toMatchObject({ ...data, id: saved.id });
    expect(Number.isFinite(new Date(found!.created_at).getTime())).toBe(true);
  });

  it("getById devuelve null para un id inexistente", async () => {
    await expect(repository.getById("no-existe")).resolves.toBeNull();
  });

  it("getByUserId encuentra al cliente con cuenta y null cuando la cuenta no tiene cliente", async () => {
    const user = await userRepository.create(validUser);
    const otherUser = await userRepository.create({ ...validUser, email: "otro@example.com" });
    const withAccount = await repository.create({ ...validNewCustomer, user_id: user.id });
    await repository.create(validNewCustomer); // cliente de local: no debe aparecer

    await expect(repository.getByUserId(user.id)).resolves.toEqual(withAccount);
    await expect(repository.getByUserId(otherUser.id)).resolves.toBeNull();
  });

  // user_id paso a ser nullable para los clientes de local. Ademas, UNIQUE admite varios
  // NULL: si no, solo podria existir un cliente de local.
  it("guarda varios clientes de local, sin user_id", async () => {
    const first = await repository.create({ ...validNewCustomer, name: "Maria Gomez" });
    const second = await repository.create({ ...validNewCustomer, name: "Carlos Diaz" });

    await expect(repository.getById(first.id)).resolves.toMatchObject({ user_id: null });
    await expect(repository.getById(second.id)).resolves.toMatchObject({ user_id: null });
  });

  // Simula una base creada con el esquema viejo (user_id NOT NULL) y vuelve a correr
  // init.sql, como en cada arranque. El DDL de Postgres es transaccional, asi que el
  // ROLLBACK del afterEach lo deshace.
  it("init.sql vuelve nullable el user_id de una base creada con el esquema viejo", async () => {
    const userIdIsNullable = async () => {
      const { rows } = await client!.query(
        `SELECT is_nullable FROM information_schema.columns
         WHERE table_name = 'customers' AND column_name = 'user_id'`,
      );
      return rows[0].is_nullable;
    };
    await client!.query("ALTER TABLE customers ALTER COLUMN user_id SET NOT NULL");
    expect(await userIdIsNullable()).toBe("NO");

    // Correrlo de nuevo sobre una base existente tampoco puede fallar (es idempotente).
    await client!.query(schema);

    expect(await userIdIsNullable()).toBe("YES");
    const local = await repository.create(validNewCustomer);
    expect(local.user_id).toBeNull();
  });

  it("getByIds trae solo los clientes pedidos en una sola consulta", async () => {
    const a = await repository.create({ ...validNewCustomer, name: "A" });
    const b = await repository.create({ ...validNewCustomer, name: "B" });
    const c = await repository.create({ ...validNewCustomer, name: "C" });

    const found = await repository.getByIds([c.id, a.id, "no-existe"]);

    // El repo no garantiza orden (ANY sin ORDER BY): los services arman un Map por id.
    expect(found.map((customer) => customer.id).sort()).toEqual([a.id, c.id].sort());
    expect(found).not.toContainEqual(b);
    await expect(repository.getByIds([])).resolves.toEqual([]);
  });

  it("update parcial modifica solo los campos enviados y conserva el resto", async () => {
    const saved = await repository.create({
      ...validNewCustomer,
      government_id: "30123456",
      phone: "3411234567",
      address: "Av. Siempreviva 742",
    });

    const updated = await repository.update(saved.id, {
      phone: "3417654321",
      government_id: null,
    });

    expect(updated).toEqual({ ...saved, phone: "3417654321", government_id: null });
    await expect(repository.getById(saved.id)).resolves.toEqual(updated);
  });

  it("update puede cambiar todos los campos editables a la vez", async () => {
    const saved = await repository.create(validNewCustomer);
    const changes = {
      name: "Empresa SA",
      government_id: "30712345678",
      tax_status: "responsable_inscripto",
      phone: "3411234567",
      address: "Córdoba 1234",
    };

    const updated = await repository.update(saved.id, changes);

    expect(updated).toEqual({ ...saved, ...changes });
  });

  it("getAll devuelve todos los clientes, con y sin cuenta", async () => {
    const user = await userRepository.create(validUser);
    const withAccount = await repository.create({ ...validNewCustomer, user_id: user.id });
    const local = await repository.create(validNewCustomer);

    const all = await repository.getAll();

    expect(all).toHaveLength(2);
    expect(all).toEqual(expect.arrayContaining([withAccount, local]));
  });

  it("update sin campos devuelve el cliente sin cambios y null si no existe", async () => {
    const saved = await repository.create(validNewCustomer);

    await expect(repository.update(saved.id, {})).resolves.toEqual(saved);
    await expect(repository.update("no-existe", { name: "X" })).resolves.toBeNull();
  });

  it("delete devuelve true la primera vez y false la segunda", async () => {
    const saved = await repository.create(validNewCustomer);

    await expect(repository.delete(saved.id)).resolves.toBe(true);
    await expect(repository.getById(saved.id)).resolves.toBeNull();
    await expect(repository.delete(saved.id)).resolves.toBe(false);
  });
});
