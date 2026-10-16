import { Pool, PoolClient } from "pg";

// Ejecuta work dentro de una transaccion de PostgreSQL sobre una sola conexion del pool:
// si work termina bien hace COMMIT; si lanza, ROLLBACK y propaga el error. Los repositorios
// que participan tienen que crearse con el client que recibe work.
export async function withTransaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    client.release();
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
      client.release();
    } catch (rollbackError) {
      // Si tampoco se puede hacer ROLLBACK (por ejemplo, se corto la conexion), la conexion
      // se descarta en vez de volver al pool en un estado desconocido. Postgres descarta
      // por su cuenta la transaccion que quedo abierta.
      client.release(rollbackError as Error);
    }
    throw error;
  }
}
