import { EventEmitter } from "node:events";
import type { Pool, PoolClient } from "pg";
import { withTransaction } from "../../src/db/transaction";

// Client falso de pg: un EventEmitter real (on/removeListener se comportan como en pg) que
// registra las queries y como se devolvio al pool. failOn hace fallar una query puntual.
class FakeClient extends EventEmitter {
  readonly queries: string[] = [];
  readonly failOn = new Map<string, Error>();
  readonly release = jest.fn();

  async query(sql: string): Promise<void> {
    this.queries.push(sql);
    const error = this.failOn.get(sql);
    if (error) throw error;
  }
}

describe("withTransaction", () => {
  let client: FakeClient;
  let pool: Pool;

  beforeEach(() => {
    client = new FakeClient();
    pool = { connect: async () => client as unknown as PoolClient } as unknown as Pool;
  });

  it("hace BEGIN, el trabajo y COMMIT, y devuelve la conexión sana al pool", async () => {
    const result = await withTransaction(pool, async (tx) => {
      await tx.query("INSERT 1");
      return "resultado";
    });

    expect(result).toBe("resultado");
    expect(client.queries).toEqual(["BEGIN", "INSERT 1", "COMMIT"]);
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(client.release).toHaveBeenCalledWith(undefined);
  });

  // Cada transaccion agrega su listener: si no lo sacara, se acumularian en las conexiones
  // que el pool reusa (y Node avisaria de un posible memory leak).
  it("saca su listener de 'error' antes de devolver la conexión al pool", async () => {
    await withTransaction(pool, async () => "ok");
    await withTransaction(pool, async () => {
      throw new Error("fallo");
    }).catch(() => undefined);

    expect(client.listenerCount("error")).toBe(0);
  });

  it("si el trabajo lanza, hace ROLLBACK, devuelve la conexión y propaga el MISMO error", async () => {
    const error = new Error("fallo del trabajo");

    await expect(
      withTransaction(pool, async () => {
        throw error;
      }),
    ).rejects.toBe(error);

    expect(client.queries).toEqual(["BEGIN", "ROLLBACK"]);
    expect(client.release).toHaveBeenCalledWith(undefined);
  });

  // Si el ROLLBACK falla, la conexion quedo en un estado desconocido: puede seguir dentro de
  // la transaccion. Devolverla al pool haria que el proximo que la tome trabaje adentro.
  it("si el ROLLBACK falla, descarta la conexión y propaga el error original, no el del ROLLBACK", async () => {
    const workError = new Error("fallo del trabajo");
    const rollbackError = new Error("fallo del rollback");
    client.failOn.set("ROLLBACK", rollbackError);

    await expect(
      withTransaction(pool, async () => {
        throw workError;
      }),
    ).rejects.toBe(workError);

    expect(client.release).toHaveBeenCalledTimes(1);
    expect(client.release).toHaveBeenCalledWith(rollbackError); // con error: el pool la destruye
  });

  // El caso real de conexion perdida: pg emite 'error' en el client. Sin listener, Node lo
  // trata como excepcion no capturada y tira abajo el servidor.
  it("si se pierde la conexión, no tira abajo el proceso y la descarta sin intentar ROLLBACK", async () => {
    const connectionLost = new Error("Connection terminated unexpectedly");
    const workError = new Error("fallo del trabajo");

    await expect(
      withTransaction(pool, async () => {
        // emit('error') sin listeners lanzaria aca mismo, sincronicamente.
        client.emit("error", connectionLost);
        throw workError;
      }),
    ).rejects.toBe(workError);

    expect(client.queries).toEqual(["BEGIN"]);
    expect(client.release).toHaveBeenCalledWith(connectionLost);
    // Se deja el listener en la conexion descartada, por si llega otro evento tarde.
    expect(() => client.emit("error", new Error("evento tardío"))).not.toThrow();
  });

  it("si falla el BEGIN, no ejecuta el trabajo y propaga el error", async () => {
    const beginError = new Error("fallo del begin");
    client.failOn.set("BEGIN", beginError);
    const work = jest.fn();

    await expect(withTransaction(pool, work)).rejects.toBe(beginError);

    expect(work).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("si falla el COMMIT, intenta ROLLBACK y propaga el error del COMMIT", async () => {
    const commitError = new Error("fallo del commit");
    client.failOn.set("COMMIT", commitError);

    await expect(withTransaction(pool, async () => "ok")).rejects.toBe(commitError);

    expect(client.queries).toEqual(["BEGIN", "COMMIT", "ROLLBACK"]);
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
