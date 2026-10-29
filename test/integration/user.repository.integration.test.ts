import { Pool } from "pg";
import type { PoolClient } from "pg";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { UserRepositoryPostgres } from "../../src/user/user.repository.postgres";
import { validUser } from "../fixtures";

describe("UserRepositoryPostgres — integración con BD real", () => {
  let pool: Pool;
  let repository: UserRepositoryPostgres;
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
    const schema = await readFile(resolve(__dirname, "../../src/db/sql/init.sql"), "utf8");
    await pool.query(schema);
  }, 180_000);

  // Cada test corre en una transaccion que se descarta al final: la base arranca limpia
  // sin tener que recrear el contenedor.
  beforeEach(async () => {
    client = await pool.connect();
    await client.query("BEGIN");
    repository = new UserRepositoryPostgres(client);
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

  it("guarda un usuario y getByEmail lo recupera con todos sus datos", async () => {
    const saved = await repository.create(validUser);

    const found = await repository.getByEmail(validUser.email);

    expect(typeof saved.id).toBe("string");
    expect(saved.id.length).toBeGreaterThan(0);
    expect(found).toEqual(saved);
    expect(found).toMatchObject(validUser);
    await expect(repository.getByEmail("nadie@example.com")).resolves.toBeNull();
  });

  // El login compara emails sin distinguir mayusculas: Cliente@Example.com es la misma cuenta.
  it("getByEmail no distingue mayúsculas de minúsculas", async () => {
    const saved = await repository.create({ ...validUser, email: "Cliente@Example.com" });

    await expect(repository.getByEmail("cliente@example.com")).resolves.toEqual(saved);
    await expect(repository.getByEmail("CLIENTE@EXAMPLE.COM")).resolves.toEqual(saved);
  });

  it("rechaza un email duplicado por la restricción UNIQUE", async () => {
    await repository.create(validUser);

    await expect(repository.create({ ...validUser, password: "otra" })).rejects.toMatchObject({
      code: "23505", // unique_violation
      constraint: "users_email_key",
    });
  });

  // init.sql siembra el usuario owner: tiene que existir en cualquier base nueva.
  it("el esquema crea el usuario owner inicial", async () => {
    await expect(repository.getByEmail("admin@tiendabox.com")).resolves.toMatchObject({
      role: "owner",
    });
  });

  it("getByIds trae solo los usuarios pedidos", async () => {
    const a = await repository.create({ ...validUser, email: "a@example.com" });
    await repository.create({ ...validUser, email: "b@example.com" });
    const c = await repository.create({ ...validUser, email: "c@example.com" });

    const found = await repository.getByIds([a.id, c.id, "no-existe"]);

    expect(found.map((user) => user.id).sort()).toEqual([a.id, c.id].sort());
    await expect(repository.getByIds([])).resolves.toEqual([]);
  });

  it("update parcial modifica solo los campos enviados y conserva el resto", async () => {
    const saved = await repository.create(validUser);

    const updated = await repository.update(saved.id, { password: "nueva456" });

    expect(updated).toEqual({ ...saved, password: "nueva456" });
    await expect(repository.getById(saved.id)).resolves.toEqual(updated);
    await expect(repository.update(saved.id, {})).resolves.toEqual(updated);
    await expect(repository.update("no-existe", { role: "owner" })).resolves.toBeNull();
  });

  it("update puede cambiar email y rol", async () => {
    const saved = await repository.create(validUser);

    const updated = await repository.update(saved.id, {
      email: "nuevo@example.com",
      role: "owner",
    });

    expect(updated).toEqual({ ...saved, email: "nuevo@example.com", role: "owner" });
    await expect(repository.getByEmail(validUser.email)).resolves.toBeNull();
  });

  it("getAll devuelve el owner sembrado por init.sql y los usuarios creados", async () => {
    const saved = await repository.create(validUser);

    const all = await repository.getAll();

    expect(all).toHaveLength(2);
    expect(all).toContainEqual(saved);
    expect(all.map((user) => user.email)).toContain("admin@tiendabox.com");
  });

  it("delete devuelve true la primera vez y false la segunda", async () => {
    const saved = await repository.create(validUser);

    await expect(repository.delete(saved.id)).resolves.toBe(true);
    await expect(repository.getById(saved.id)).resolves.toBeNull();
    await expect(repository.delete(saved.id)).resolves.toBe(false);
  });
});
