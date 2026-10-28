import type { Product } from "../src/product/product.entity";
import type { Customer } from "../src/customer/customer.entity";
import type { User } from "../src/user/user.entity";
import type { Category } from "../src/category/category.entity";
import type { Brand } from "../src/brand/brand.entity";
import type { IOrderRepository } from "../src/order/order.repository.interface";
import type { Request, Response } from "express";

// Datos de prueba compartidos entre los tests. Cada test arma sus variantes con spread,
// por ejemplo: { ...validProduct, id: "p1", stock: 0 }.

// Producto activo de tipo stock, con precio y stock disponibles.
export const validProduct: Omit<Product, "id"> = {
  name: "Producto",
  description: null,
  image_url: null,
  type: "stock",
  price: 100,
  stock: 10,
  category_id: "cat-1",
  brand_id: "brand-1",
  is_active: true,
};

// Datos para crear un cliente de local (sin cuenta web): created_at lo pone la base.
export const validNewCustomer: Omit<Customer, "id" | "created_at"> = {
  user_id: null,
  name: "Cliente",
  government_id: null,
  tax_status: "consumidor_final",
  phone: null,
  address: null,
};

// Cliente de local ya guardado. Para vincularlo a una cuenta: { ...validCustomer, user_id: "user-1" }.
export const validCustomer: Omit<Customer, "id"> = {
  ...validNewCustomer,
  created_at: "2026-01-01T00:00:00.000Z",
};

// Cuenta web con rol cliente.
export const validUser: Omit<User, "id" | "created_at"> = {
  email: "cliente@example.com",
  password: "secreto123",
  role: "cliente",
};

// Alta de una cuenta desde el registro publico de la tienda.
export const validRegistration: { name: string; email: string; password: string } = {
  name: "Maria Gomez",
  email: "maria@example.com",
  password: "secreto123",
};

export const validCategory: Omit<Category, "id"> = {
  name: "Notebooks",
  description: "Computadoras portátiles",
};

export const validBrand: Omit<Brand, "id"> = {
  name: "Lenovo",
  logo_url: "https://example.com/lenovo.png",
};

// Pedido con retiro en el local y un item de stock. Le falta el customer_id, que depende
// del cliente que cree cada test.
export const validNewOrder: Omit<Parameters<IOrderRepository["create"]>[0], "customer_id"> = {
  status: "pendiente",
  delivery_type: "retiro",
  delivery_address: null,
  total: 200,
  items: [
    { product_id: "p1", product_name: "Teclado", unit_price: 100, quantity: 2, type: "stock" },
  ],
};

// Dobles minimos de Express para probar middlewares y controllers sin levantar un servidor.

// Response que registra lo que se llamo: el codigo, el body y si se cerro con send().
// status/json/send devuelven el mismo objeto, para poder encadenarlos como en Express.
export function createMockResponse() {
  const mock = {
    statusCode: undefined as number | undefined,
    body: undefined as unknown,
    sent: false,
    status(code: number) {
      mock.statusCode = code;
      return mock;
    },
    json(body: unknown) {
      mock.body = body;
      mock.sent = true;
      return mock;
    },
    send(body?: unknown) {
      mock.body = body;
      mock.sent = true;
      return mock;
    },
  };
  return mock as typeof mock & Response;
}

// Request con solo lo que usan los middlewares y controllers; cada test pisa lo que necesite.
export function createMockRequest(overrides: Partial<Request> = {}): Request {
  return { headers: {}, params: {}, query: {}, body: {}, ...overrides } as Request;
}
