import { OrderController } from "../../src/order/order.controller";
import type { OrderService } from "../../src/order/order.service";
import { CustomerController } from "../../src/customer/customer.controller";
import type { CustomerService } from "../../src/customer/customer.service";
import { ConflictError, ForbiddenError, ValidationError } from "../../src/errors";
import { createMockRequest, createMockResponse } from "../fixtures";

// Los controllers solo traducen: llaman al service y convierten su resultado o su error en
// un codigo HTTP. El service se reemplaza por stubs que devuelven o lanzan lo que cada test
// necesita; la logica de negocio ya esta probada en los tests de cada service.

type Handler = (
  req: ReturnType<typeof createMockRequest>,
  res: ReturnType<typeof createMockResponse>,
) => Promise<void>;

const owner = { id: "user-owner", role: "owner" };

// Errores que puede lanzar cada service y el codigo que corresponde a cada uno. OrderService
// nunca lanza ConflictError (no hay duplicados en pedidos), por eso no esta en su lista.
const orderErrors: [string, number, Error][] = [
  ["ValidationError", 400, new ValidationError("pedido inválido")],
  ["ForbiddenError", 403, new ForbiddenError("pedido ajeno")],
];
const customerErrors: [string, number, Error][] = [
  ["ValidationError", 400, new ValidationError("cliente inválido")],
  ["ConflictError", 409, new ConflictError("email ya usado")],
  ["ForbiddenError", 403, new ForbiddenError("cliente ajeno")],
];

let consoleError: jest.SpyInstance;

beforeEach(() => {
  // Los 500 se loguean: se silencia la consola y se verifica que el error no se pierda.
  consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  consoleError.mockRestore();
});

async function call(handler: Handler, request: Parameters<typeof createMockRequest>[0] = {}) {
  const res = createMockResponse();
  await handler(createMockRequest({ user: owner, ...request }), res);
  return res;
}

describe("OrderController", () => {
  const service = {
    createOrder: jest.fn(),
    getMyOrders: jest.fn(),
    getAllOrders: jest.fn(),
    getById: jest.fn(),
    changeStatus: jest.fn(),
    cancelOrder: jest.fn(),
  };
  const controller = new OrderController(service as unknown as OrderService);

  // Cada metodo del controller, con el metodo del service que llama y su respuesta exitosa.
  const methods: [keyof OrderController, keyof typeof service, number][] = [
    ["create", "createOrder", 201],
    ["getMyOrders", "getMyOrders", 200],
    ["getAll", "getAllOrders", 200],
    ["getById", "getById", 200],
    ["changeStatus", "changeStatus", 200],
    ["cancel", "cancelOrder", 200],
  ];

  describe.each(methods)("%s", (method, serviceMethod, successStatus) => {
    const handler = () => controller[method] as Handler;
    const request = { params: { id: "order-1" }, body: { status: "confirmado" } };

    it(`responde ${successStatus} con lo que devuelve el service`, async () => {
      const order = { id: "order-1" };
      service[serviceMethod].mockResolvedValue(
        method === "getMyOrders" || method === "getAll" ? [order] : order,
      );

      const res = await call(handler(), request);

      expect(res.statusCode).toBe(successStatus);
      expect(res.body).toEqual(method === "getMyOrders" || method === "getAll" ? [order] : order);
    });

    it.each(orderErrors)(
      "traduce %s a %i con el mensaje del service",
      async (_name, status, error) => {
        service[serviceMethod].mockRejectedValue(error);

        const res = await call(handler(), request);

        expect(res.statusCode).toBe(status);
        expect(res.body).toEqual({ error: error.message });
      },
    );

    it("traduce un error inesperado a 500 sin filtrar el mensaje interno", async () => {
      const internal = new Error("conexión a la base perdida");
      service[serviceMethod].mockRejectedValue(internal);

      const res = await call(handler(), request);

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ error: "Error interno del servidor" });
      expect(consoleError).toHaveBeenCalledWith(internal);
    });
  });

  it.each([
    ["getById", "getById"],
    ["changeStatus", "changeStatus"],
    ["cancel", "cancelOrder"],
  ] as const)("%s responde 404 cuando el service devuelve null", async (method, serviceMethod) => {
    service[serviceMethod].mockResolvedValue(null);

    const res = await call(controller[method] as Handler, { params: { id: "no-existe" } });

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: "Pedido no encontrado" });
  });

  // El usuario sale del token (req.user), nunca del body: si se tomara del body, un cliente
  // podria operar como otro.
  it("pasa al service el id y el rol del usuario autenticado", async () => {
    service.getById.mockResolvedValue({ id: "order-1" });
    service.cancelOrder.mockResolvedValue({ id: "order-1" });
    const request = {
      user: { id: "user-1", role: "cliente" },
      params: { id: "order-1" },
      body: { user_id: "otro", role: "owner" },
    };

    await call(controller.getById as Handler, request);
    await call(controller.cancel as Handler, request);

    expect(service.getById).toHaveBeenLastCalledWith("order-1", "user-1", "cliente");
    expect(service.cancelOrder).toHaveBeenLastCalledWith("order-1", "user-1", "cliente");
  });

  it("getAll pasa el filtro de estado de la query", async () => {
    service.getAllOrders.mockResolvedValue([]);

    await call(controller.getAll as Handler, { query: { status: "pendiente" } });

    expect(service.getAllOrders).toHaveBeenLastCalledWith("pendiente");
  });
});

describe("CustomerController", () => {
  const service = {
    getAll: jest.fn(),
    getById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const controller = new CustomerController(service as unknown as CustomerService);

  const methods: [keyof CustomerController, keyof typeof service][] = [
    ["getAll", "getAll"],
    ["getById", "getById"],
    ["create", "create"],
    ["update", "update"],
    ["delete", "delete"],
  ];

  describe.each(methods)("%s", (method, serviceMethod) => {
    const handler = () => controller[method] as Handler;
    const request = { params: { id: "cus-1" }, body: { name: "Maria" } };

    it.each(customerErrors)(
      "traduce %s a %i con el mensaje del service",
      async (_name, status, error) => {
        service[serviceMethod].mockRejectedValue(error);

        const res = await call(handler(), request);

        expect(res.statusCode).toBe(status);
        expect(res.body).toEqual({ error: error.message });
      },
    );

    it("traduce un error inesperado a 500 sin filtrar el mensaje interno", async () => {
      const internal = new Error("conexión a la base perdida");
      service[serviceMethod].mockRejectedValue(internal);

      const res = await call(handler(), request);

      expect(res.statusCode).toBe(500);
      expect(res.body).toEqual({ error: "Error interno del servidor" });
      expect(consoleError).toHaveBeenCalledWith(internal);
    });
  });

  it("create responde 201 con el cliente y la contraseña generada", async () => {
    const result = { customer: { id: "cus-1" }, generated_password: "Abc123xyz9" };
    service.create.mockResolvedValue(result);

    const res = await call(controller.create as Handler, { body: { name: "Maria" } });

    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual(result);
  });

  it.each([
    ["getAll", "getAll"],
    ["getById", "getById"],
    ["update", "update"],
  ] as const)("%s responde 200 con lo que devuelve el service", async (method, serviceMethod) => {
    service[serviceMethod].mockResolvedValue({ id: "cus-1" });

    const res = await call(controller[method] as Handler, { params: { id: "cus-1" } });

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ id: "cus-1" });
  });

  it("delete responde 204 sin body cuando borra", async () => {
    service.delete.mockResolvedValue(true);

    const res = await call(controller.delete as Handler, { params: { id: "cus-1" } });

    expect(res.statusCode).toBe(204);
    expect(res.body).toBeUndefined();
    expect(res.sent).toBe(true);
  });

  it.each([
    ["getById", "getById", null],
    ["update", "update", null],
    ["delete", "delete", false],
  ] as const)(
    "%s responde 404 cuando no encuentra el cliente",
    async (method, serviceMethod, value) => {
      service[serviceMethod].mockResolvedValue(value);

      const res = await call(controller[method] as Handler, { params: { id: "no-existe" } });

      expect(res.statusCode).toBe(404);
      expect(res.body).toEqual({ error: "Cliente no encontrado" });
    },
  );

  it("update pasa el body y el usuario autenticado al service", async () => {
    service.update.mockResolvedValue({ id: "cus-1" });

    await call(controller.update as Handler, {
      user: { id: "user-1", role: "cliente" },
      params: { id: "cus-1" },
      body: { phone: "3411234567" },
    });

    expect(service.update).toHaveBeenLastCalledWith(
      "cus-1",
      { phone: "3411234567" },
      "user-1",
      "cliente",
    );
  });
});
