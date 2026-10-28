import { authorize } from "../../src/middlewares/authorize";
import { createMockRequest, createMockResponse } from "../fixtures";

describe("authorize", () => {
  let next: jest.Mock;

  beforeEach(() => {
    next = jest.fn();
  });

  function run(roles: string[], user?: { id: string; role: string }) {
    const req = createMockRequest(user ? { user } : {});
    const res = createMockResponse();
    authorize(...roles)(req, res, next);
    return res;
  }

  // Pasa si alguien monta authorize sin authenticate antes: no hay usuario que autorizar.
  it("sin req.user responde 401 y no llama a next", () => {
    const res = run(["owner"]);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "No autenticado" });
    expect(next).not.toHaveBeenCalled();
  });

  it("con un rol que no está en la lista responde 403 y no llama a next", () => {
    const res = run(["owner"], { id: "user-1", role: "cliente" });

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "No autorizado" });
    expect(next).not.toHaveBeenCalled();
  });

  it("con el rol correcto llama a next sin responder", () => {
    const res = run(["owner"], { id: "user-1", role: "owner" });

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.sent).toBe(false);
  });

  it.each(["cliente", "owner"])("con varios roles permitidos deja pasar a %s", (role) => {
    run(["cliente", "owner"], { id: "user-1", role });

    expect(next).toHaveBeenCalledTimes(1);
  });

  // La comparacion es exacta: un rol con otra capitalizacion no es el mismo rol.
  it("no confunde roles parecidos", () => {
    const res = run(["owner"], { id: "user-1", role: "Owner" });

    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });
});
