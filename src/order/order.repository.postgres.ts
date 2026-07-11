import crypto from "crypto";
import { Pool } from "pg";
import { Order, OrderItem, OrderStatus } from "./order.entity";
import { IOrderRepository } from "./order.repository.interface";

// Implementacion del repositorio de Order que habla con PostgreSQL.
export class OrderRepositoryPostgres implements IOrderRepository {
  constructor(private readonly pool: Pool) {}

  async create(data: {
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
  }): Promise<Order> {
    const orderId = crypto.randomUUID();

    const orderResult = await this.pool.query(
      `INSERT INTO orders (id, customer_id, status, delivery_type, delivery_address, total)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, customer_id, status, delivery_type, delivery_address,
                 total::text, created_at::text AS created_at`,
      [orderId, data.customer_id, data.status, data.delivery_type, data.delivery_address, data.total],
    );

    const items: OrderItem[] = [];
    for (const item of data.items) {
      const itemId = crypto.randomUUID();
      await this.pool.query(
        `INSERT INTO order_items (id, order_id, product_id, product_name, unit_price, quantity, type)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [itemId, orderId, item.product_id, item.product_name, item.unit_price, item.quantity, item.type],
      );
      items.push({
        id: itemId,
        product_id: item.product_id,
        product_name: item.product_name,
        unit_price: item.unit_price,
        quantity: item.quantity,
        type: item.type,
      });
    }

    const row = orderResult.rows[0];
    return this.toEntity(row, items);
  }

  async getById(id: string): Promise<Order | null> {
    const result = await this.pool.query(
      `SELECT id, customer_id, status, delivery_type, delivery_address,
              total::text, created_at::text AS created_at
       FROM orders WHERE id = $1`,
      [id],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const items = await this.loadItems(id);
    return this.toEntity(result.rows[0], items);
  }

  async getByCustomerId(customerId: string): Promise<Order[]> {
    const result = await this.pool.query(
      `SELECT id, customer_id, status, delivery_type, delivery_address,
              total::text, created_at::text AS created_at
       FROM orders WHERE customer_id = $1
       ORDER BY created_at DESC`,
      [customerId],
    );

    const orders: Order[] = [];
    for (const row of result.rows) {
      const items = await this.loadItems(row.id);
      orders.push(this.toEntity(row, items));
    }
    return orders;
  }

  async getAll(statusFilter?: string): Promise<Order[]> {
    let query = `SELECT id, customer_id, status, delivery_type, delivery_address,
                        total::text, created_at::text AS created_at
                 FROM orders`;
    const params: string[] = [];

    if (statusFilter) {
      query += ` WHERE status = $1`;
      params.push(statusFilter);
    }

    query += ` ORDER BY created_at DESC`;

    const result = await this.pool.query(query, params);

    const orders: Order[] = [];
    for (const row of result.rows) {
      const items = await this.loadItems(row.id);
      orders.push(this.toEntity(row, items));
    }
    return orders;
  }

  async updateStatus(id: string, status: OrderStatus): Promise<Order | null> {
    const result = await this.pool.query(
      `UPDATE orders SET status = $1 WHERE id = $2
       RETURNING id, customer_id, status, delivery_type, delivery_address,
                 total::text, created_at::text AS created_at`,
      [status, id],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const items = await this.loadItems(id);
    return this.toEntity(result.rows[0], items);
  }

  // Carga los items de una orden desde order_items.
  private async loadItems(orderId: string): Promise<OrderItem[]> {
    const result = await this.pool.query(
      `SELECT id, product_id, product_name, unit_price::text, quantity, type
       FROM order_items WHERE order_id = $1`,
      [orderId],
    );
    return result.rows.map((row) => this.toOrderItem(row));
  }

  // Mapea una fila de PostgreSQL a la entidad Order.
  private toEntity(
    row: {
      id: string;
      customer_id: string;
      status: string;
      delivery_type: string;
      delivery_address: string | null;
      total: string;
      created_at: string;
    },
    items: OrderItem[],
  ): Order {
    return {
      id: row.id,
      customer_id: row.customer_id,
      status: row.status as OrderStatus,
      delivery_type: row.delivery_type,
      delivery_address: row.delivery_address,
      total: parseFloat(row.total),
      created_at: row.created_at,
      items,
    };
  }

  // Mapea una fila de order_items a la entidad OrderItem.
  private toOrderItem(row: {
    id: string;
    product_id: string;
    product_name: string;
    unit_price: string | null;
    quantity: number;
    type: string;
  }): OrderItem {
    return {
      id: row.id,
      product_id: row.product_id,
      product_name: row.product_name,
      unit_price: row.unit_price ? parseFloat(row.unit_price) : null,
      quantity: row.quantity,
      type: row.type,
    };
  }
}
