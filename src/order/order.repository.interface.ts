import { Order, OrderStatus } from "./order.entity";

// Contrato del repositorio de Order.
export interface IOrderRepository {
  create(data: {
    customer_id: string;
    status: OrderStatus;
    delivery_type: string;
    delivery_address: string | null;
    total: number;
    items: {
      product_id: string;
      product_name: string;
      unit_price: number | null;
      quantity: number;
      type: string;
    }[];
  }): Promise<Order>;
  getById(id: string): Promise<Order | null>;
  getByCustomerId(customerId: string): Promise<Order[]>;
  getAll(statusFilter?: string): Promise<Order[]>;
  // true si el cliente tiene al menos un pedido, en cualquier estado.
  existsForCustomer(customerId: string): Promise<boolean>;
  // Cambia el estado solo si el actual está en `from`. Devuelve el pedido actualizado,
  // o null si no se modificó ninguna fila (no existe o otro request ya lo cambió).
  updateStatusIf(id: string, from: OrderStatus[], to: OrderStatus): Promise<Order | null>;
}
