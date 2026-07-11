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
  updateStatus(id: string, status: OrderStatus): Promise<Order | null>;
}
