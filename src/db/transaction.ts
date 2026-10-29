import { Pool, PoolClient } from "pg";

// Ejecuta work dentro de una transaccion de PostgreSQL sobre una sola conexion del pool:
// si work termina bien hace COMMIT; si lanza, ROLLBACK y propaga el error. Los repositorios
// que participan tienen que crearse con el client que recibe work.
export async function withTransaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();

  // Mientras la conexion esta prestada, el pool le saca su listener de 'error'. Si la base
  // corta la conexion, pg emite 'error' en el client y, sin ningun listener, Node lo trata
  // como excepcion no capturada y tira abajo el servidor. El error igual llega por la query
  // en curso o por la siguiente; aca solo se registra para no reusar la conexion.
  let connectionError: Error | undefined;
  const onConnectionError = (error: Error): void => {
    connectionError = error;
  };
  client.on("error", onConnectionError);

  // Devuelve la conexion sana al pool. Con error, la descarta en vez de devolverla en un
  // estado desconocido (Postgres descarta por su cuenta la transaccion que quedo abierta), y
  // el listener queda puesto por si llega otro evento tarde de una conexion ya cortada.
  const release = (error?: Error): void => {
    if (!error) client.removeListener("error", onConnectionError);
    client.release(error);
  };

  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    release();
    return result;
  } catch (error) {
    if (connectionError) {
      // La conexion ya se perdio: no tiene sentido intentar el ROLLBACK.
      release(connectionError);
    } else {
      try {
        await client.query("ROLLBACK");
        release();
      } catch (rollbackError) {
        release(rollbackError as Error);
      }
    }
    throw error;
  }
}
