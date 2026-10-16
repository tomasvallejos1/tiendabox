import { Pool } from "pg";
import type { PoolClient } from "pg";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { SessionRepositoryPostgres } from "../../src/session/session.repository.postgres";
import { UserRepositoryPostgres } from "../../src/user/user.repository.postgres";
import { validUser } from "../fixtures";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

describe("SessionRepositoryPostgres — integración con BD real", () => {
  let pool: Pool;
  let repository: SessionRepositoryPostgres;
  let client: PoolClient | undefined;
  let container: StartedPostgreSqlContainer | undefined;
  let userId: string;

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
    repository = new SessionRepositoryPostgres(client);
    // sessions.user_id tiene FK a users.
    userId = (await new UserRepositoryPostgres(client).create(validUser)).id;
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

  // authenticate parsea expires_at con new Date(): tiene que salir de la base en un formato
  // que JS entienda y con zona horaria, o la expiracion se correria segun el TZ del proceso.
  it("create genera un token y una expiración a 24 horas que new Date() interpreta bien", async () => {
    const before = Date.now();

    const session = await repository.create(userId);

    const expiresAt = new Date(session.expires_at).getTime();
    expect(session.token).toMatch(/^[0-9a-f-]{36}$/);
    expect(session.user_id).toBe(userId);
    expect(Number.isFinite(expiresAt)).toBe(true);
    expect(expiresAt).toBeGreaterThan(Date.now());
    // Margen de 1 minuto por la diferencia de reloj entre el proceso y la base.
    expect(Math.abs(expiresAt - (before + ONE_DAY_MS))).toBeLessThan(60_000);
  });

  it("cada sesión tiene un token distinto", async () => {
    const first = await repository.create(userId);
    const second = await repository.create(userId);

    expect(first.token).not.toBe(second.token);
  });

  it("getByToken encuentra la sesión y devuelve null para un token inexistente", async () => {
    const session = await repository.create(userId);

    await expect(repository.getByToken(session.token)).resolves.toEqual(session);
    await expect(repository.getByToken("token-inexistente")).resolves.toBeNull();
  });

  it("deleteByToken elimina la sesión y devuelve false si ya no existe", async () => {
    const session = await repository.create(userId);

    await expect(repository.deleteByToken(session.token)).resolves.toBe(true);
    await expect(repository.getByToken(session.token)).resolves.toBeNull();
    await expect(repository.deleteByToken(session.token)).resolves.toBe(false);
  });
});
