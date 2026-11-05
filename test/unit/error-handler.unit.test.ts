import { errorHandler, notFoundHandler } from "../../src/middlewares/error-handler";
import { ConflictError, ForbiddenError, ValidationError } from "../../src/errors";
import { createMockRequest, createMockResponse } from "../fixtures";

describe("errorHandler", () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    // Los 500 se loguean: se silencia la consola y se verifica que el error no se pierda.
    consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  function handle(error: unknown) {
    const res = createMockResponse();
    errorHandler(error, createMockRequest(), res, jest.fn());
    return res;
  }

  it.each([
    ["ValidationError", 400, new ValidationError("dato inválido")],
    ["ConflictError", 409, new ConflictError("ya existe")],
    ["ForbiddenError", 403, new ForbiddenError("no es tuyo")],
  ])("mapea %s a %i con su mensaje", (_name, status, error) => {
    const res = handle(error);

    expect(res.statusCode).toBe(status);
    expect(res.body).toEqual({ error: error.message });
    expect(consoleError).not.toHaveBeenCalled();
  });

  // Un stack trace en la respuesta expone archivos, funciones y librerias del servidor.
  it("un error inesperado da 500 sin filtrar el mensaje interno ni el stack", () => {
    const internal = new Error('relation "orders" does not exist en pg/lib/client.js');

    const res = handle(internal);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "Error interno del servidor" });
    const body = JSON.stringify(res.body);
    expect(body).not.toContain(internal.message);
    expect(body).not.toContain("client.js");
    expect(body).not.toContain(internal.stack!.split("\n")[1]!.trim());
    // El detalle no se pierde: queda en el log del servidor.
    expect(consoleError).toHaveBeenCalledWith(internal);
  });

  // express.json() rechaza el body antes de llegar a los controllers: el error viene
  // directo aca. Es un error del cliente, no del servidor.
  it("un JSON mal formado en el body da 400 con un mensaje claro", () => {
    // Misma forma que el error de body-parser para '{bad json'.
    const parseError = Object.assign(new SyntaxError("Unexpected token b in JSON"), {
      status: 400,
      statusCode: 400,
      type: "entity.parse.failed",
      body: "{bad json",
    });

    const res = handle(parseError);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "El cuerpo de la petición no es un JSON válido" });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("reconoce el error de JSON por SyntaxError con status 400 aunque no traiga type", () => {
    const res = handle(
      Object.assign(new SyntaxError("Unexpected end of JSON input"), { status: 400 }),
    );

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "El cuerpo de la petición no es un JSON válido" });
  });

  // Un SyntaxError propio del servidor (por ejemplo, un JSON.parse sobre datos internos)
  // sigue siendo un 500: no es culpa del cliente.
  it("un SyntaxError que no viene del body sigue dando 500", () => {
    const res = handle(new SyntaxError("Unexpected token"));

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "Error interno del servidor" });
  });

  it("también da 500 si lo lanzado no es un Error", () => {
    const res = handle("algo raro");

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: "Error interno del servidor" });
  });

  it.each([
    new ValidationError("a"),
    new ConflictError("b"),
    new ForbiddenError("c"),
    new Error("d"),
    { no: "es un error" },
  ])("la respuesta siempre tiene la forma { error: string } (%p)", (error) => {
    const res = handle(error);

    expect(Object.keys(res.body as object)).toEqual(["error"]);
    expect(typeof (res.body as { error: unknown }).error).toBe("string");
  });

  // Express reconoce a los manejadores de error por su aridad: con 3 parametros lo
  // registraria como middleware comun y nunca recibiria los errores.
  it("declara los cuatro parámetros que Express necesita para tratarlo como manejador de errores", () => {
    expect(errorHandler).toHaveLength(4);
  });
});

describe("notFoundHandler", () => {
  it("responde 404 en JSON con el método y la ruta pedida", () => {
    const res = createMockResponse();

    notFoundHandler(createMockRequest({ method: "DELETE", originalUrl: "/api/nada" }), res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "Ruta no encontrada: DELETE /api/nada" });
  });
});
