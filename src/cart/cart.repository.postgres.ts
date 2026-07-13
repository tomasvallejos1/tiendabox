import crypto from "crypto";
import { Pool } from "pg";
import { Cart, CartItem } from "./cart.entity";
import { ICartRepository } from "./cart.repository.interface";

// Implementacion del repositorio de Cart que habla con PostgreSQL.
export class CartRepositoryPostgres implements ICartRepository {
  constructor(private readonly pool: Pool) {}

  async getByCustomerId(customerId: string): Promise<Cart | null> {
    const cartResult = await this.pool.query(
      `SELECT id, customer_id, updated_at::text AS updated_at
       FROM carts WHERE customer_id = $1`,
      [customerId],
    );

    if (cartResult.rows.length === 0) {
      return null;
    }

    const cartRow = cartResult.rows[0];
    const itemsResult = await this.pool.query(
      `SELECT id, product_id, quantity
       FROM cart_items WHERE cart_id = $1`,
      [cartRow.id],
    );

    return {
      id: cartRow.id,
      customer_id: cartRow.customer_id,
      updated_at: cartRow.updated_at,
      items: itemsResult.rows.map((row) => this.toCartItem(row)),
    };
  }

  async createForCustomer(customerId: string): Promise<Cart> {
    const newId = crypto.randomUUID();
    const result = await this.pool.query(
      `INSERT INTO carts (id, customer_id)
       VALUES ($1, $2)
       RETURNING id, customer_id, updated_at::text AS updated_at`,
      [newId, customerId],
    );

    const row = result.rows[0];
    return {
      id: row.id,
      customer_id: row.customer_id,
      updated_at: row.updated_at,
      items: [],
    };
  }

  async addItem(cartId: string, productId: string, quantity: number): Promise<void> {
    const newId = crypto.randomUUID();
    await this.pool.query(
      `INSERT INTO cart_items (id, cart_id, product_id, quantity)
       VALUES ($1, $2, $3, $4)`,
      [newId, cartId, productId, quantity],
    );
    await this.touchUpdatedAt(cartId);
  }

  async updateItemQuantity(cartId: string, productId: string, quantity: number): Promise<void> {
    await this.pool.query(
      `UPDATE cart_items SET quantity = $1
       WHERE cart_id = $2 AND product_id = $3`,
      [quantity, cartId, productId],
    );
    await this.touchUpdatedAt(cartId);
  }

  async removeItem(cartId: string, productId: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM cart_items WHERE cart_id = $1 AND product_id = $2`,
      [cartId, productId],
    );
    await this.touchUpdatedAt(cartId);
    return (result.rowCount ?? 0) > 0;
  }

  async clear(cartId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM cart_items WHERE cart_id = $1`,
      [cartId],
    );
    await this.touchUpdatedAt(cartId);
  }

  // Actualiza el timestamp del carrito en cada modificacion.
  private async touchUpdatedAt(cartId: string): Promise<void> {
    await this.pool.query(
      `UPDATE carts SET updated_at = NOW() WHERE id = $1`,
      [cartId],
    );
  }

  // Mapea una fila de cart_items a la entidad CartItem.
  private toCartItem(row: { id: string; product_id: string; quantity: number }): CartItem {
    return {
      id: row.id,
      product_id: row.product_id,
      quantity: row.quantity,
    };
  }
}
