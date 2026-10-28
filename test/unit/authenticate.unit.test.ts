import { authenticate } from "../../src/middlewares/authenticate";
import { Session } from "../../src/session/session.entity";
import { ISessionRepository } from "../../src/session/session.repository.interface";
import { User } from "../../src/user/user.entity";
import { IUserRepository } from "../../src/user/user.repository.interface";
import { createMockRequest, createMockResponse, validUser } from "../fixtures";

// Hora fija del "ahora" de cada test, para probar la expiracion sin depender del reloj.
const NOW = new Date("2026-10-16T12:00:00.000Z");

class FakeSessionRepository implements ISessionRepository {
  readonly sessions = new Map<string, Session>();
  getByTokenCalls = 0;

  async create(): Promise<Session> {
    throw new Error("no usado en estos tests");
  }

  async getByToken(token: string): Promise<Session | null> {
    this.getByTokenCalls++;
    return this.sessions.get(token) ?? null;
  }

  async deleteByToken(): Promise<boolean> {
    throw new Error("no usado en estos tests");
  }
}

class FakeUserRepository implements IUserRepository {
  readonly users: User[] = [];

  async create(): Promise<User> {
    throw new Error("no usado en estos tests");
  }

  async getById(id: string): Promise<User | null> {
    return this.users.find((user) => user.id === id) ?? null;
  }

  async getByIds(): Promise<User[]> {
    throw new Error("no usado en estos tests");
  }

  async getByEmail(): Promise<User | null> {
    throw new Error("no usado en estos tests");
  }

  async getAll(): Promise<User[]> {
    throw new Error("no usado en estos tests");
  }

  async update(): Promise<User | null> {
    throw new Error("no usado en estos tests");
  }

  async delete(): Promise<boolean> {
    throw new Error("no usado en estos tests");
  }
}

// expires_at con el formato que devuelve Postgres (expires_at::text de un TIMESTAMPTZ).
function postgresTimestamp(date: Date): string {
  return date.toISOString().replace("T", " ").replace("Z", "+00");
}

describe("authenticate", () => {
  let sessions: FakeSessionRepository;
  let users: FakeUserRepository;
  let next: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    sessions = new FakeSessionRepository();
    users = new FakeUserRepository();
    next = jest.fn();
    users.users.push({ ...validUser, id: "user-1", role: "owner", created_at: "2026-01-01" });
    sessions.sessions.set("token-valido", {
      token: "token-valido",
      user_id: "user-1",
      expires_at: postgresTimestamp(new Date(NOW.getTime() + 60 * 60 * 1000)),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function run(authorization?: string) {
    const req = createMockRequest({
      headers: authorization === undefined ? {} : { authorization },
    });
    const res = createMockResponse();
    await authenticate(sessions, users)(req, res, next);
    return { req, res };
  }

  function expectRejected(res: ReturnType<typeof createMockResponse>, error: string): void {
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error });
    expect(next).not.toHaveBeenCalled();
  }

  it("sin header Authorization responde 401 y no llama a next", async () => {
    const { req, res } = await run();

    expectRejected(res, "No autenticado");
    expect(req.user).toBeUndefined();
    expect(sessions.getByTokenCalls).toBe(0);
  });

  it("con 'Bearer ' sin token responde 401 sin consultar el repositorio", async () => {
    const { res } = await run("Bearer ");

    expectRejected(res, "No autenticado");
    expect(sessions.getByTokenCalls).toBe(0);
  });

  it("con un token que no existe responde 401", async () => {
    const { req, res } = await run("Bearer token-inventado");

    expectRejected(res, "No autenticado");
    expect(req.user).toBeUndefined();
  });

  // El mensaje distinto le dice al front que tiene que mandar al usuario a loguearse de nuevo.
  it("con un token expirado responde 401 avisando que la sesión expiró", async () => {
    sessions.sessions.set("token-viejo", {
      token: "token-viejo",
      user_id: "user-1",
      expires_at: postgresTimestamp(new Date(NOW.getTime() - 60 * 1000)),
    });

    const { req, res } = await run("Bearer token-viejo");

    expectRejected(res, "Sesión expirada");
    expect(req.user).toBeUndefined();
  });

  it("un token que vence exactamente ahora se rechaza", async () => {
    sessions.sessions.set("token-limite", {
      token: "token-limite",
      user_id: "user-1",
      expires_at: postgresTimestamp(NOW),
    });

    const { res } = await run("Bearer token-limite");

    expectRejected(res, "Sesión expirada");
  });

  it("un token que vence un milisegundo después de ahora todavía es válido", async () => {
    sessions.sessions.set("token-justo", {
      token: "token-justo",
      user_id: "user-1",
      expires_at: postgresTimestamp(new Date(NOW.getTime() + 1)),
    });

    const { res } = await run("Bearer token-justo");

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.sent).toBe(false);
  });

  it("con un token válido cuyo usuario ya no existe responde 401", async () => {
    users.users.length = 0;

    const { req, res } = await run("Bearer token-valido");

    expectRejected(res, "No autenticado");
    expect(req.user).toBeUndefined();
  });

  it("con un token válido llama a next y deja req.user con el id y el rol del usuario", async () => {
    const { req, res } = await run("Bearer token-valido");

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toEqual({ id: "user-1", role: "owner" });
    expect(res.sent).toBe(false);
  });

  it("acepta el token pelado, sin el prefijo Bearer", async () => {
    const { req } = await run("token-valido");

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual({ id: "user-1", role: "owner" });
  });

  // El rol sale del usuario guardado, no de la sesion: si al usuario le cambian el rol, el
  // cambio aplica en el siguiente request aunque la sesion sea vieja.
  it("toma el rol actual del usuario guardado", async () => {
    users.users[0]!.role = "cliente";

    const { req } = await run("Bearer token-valido");

    expect(req.user?.role).toBe("cliente");
  });

  // Express 5 deriva los rechazos de un middleware async al errorHandler (500).
  it("si el repositorio falla, propaga el error sin llamar a next ni responder", async () => {
    const failure = new Error("base caída");
    jest.spyOn(sessions, "getByToken").mockRejectedValue(failure);
    const res = createMockResponse();

    await expect(
      authenticate(sessions, users)(
        createMockRequest({ headers: { authorization: "Bearer token-valido" } }),
        res,
        next,
      ),
    ).rejects.toBe(failure);
    expect(next).not.toHaveBeenCalled();
    expect(res.sent).toBe(false);
  });
});
