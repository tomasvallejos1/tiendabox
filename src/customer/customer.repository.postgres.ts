import crypto from "crypto";
import { Pool } from "pg";
import { Customer } from "./customer.entity";
import { ICustomerRepository } from "./customer.repository.interface";

// Implementacion del repositorio que SOLO habla con PostgreSQL.
export class CustomerRepositoryPostgres implements ICustomerRepository {
  constructor(private readonly pool: Pool) {}

  async create(data: Omit<Customer, "id" | "created_at">): Promise<Customer> {
    const newId = crypto.randomUUID();
    const result = await this.pool.query(
      `INSERT INTO customers (id, user_id, name, government_id, tax_status, phone, address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, user_id, name, government_id, tax_status, phone, address, created_at::text AS created_at`,
      [
        newId,
        data.user_id,
        data.name,
        data.government_id,
        data.tax_status,
        data.phone,
        data.address,
      ],
    );
    return this.toEntity(result.rows[0]);
  }

  async getById(id: string): Promise<Customer | null> {
    const result = await this.pool.query(
      `SELECT id, user_id, name, government_id, tax_status, phone, address, created_at::text AS created_at
       FROM customers WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.toEntity(result.rows[0]) : null;
  }

  async getByUserId(userId: string): Promise<Customer | null> {
    const result = await this.pool.query(
      `SELECT id, user_id, name, government_id, tax_status, phone, address, created_at::text AS created_at
       FROM customers WHERE user_id = $1`,
      [userId],
    );
    return result.rows[0] ? this.toEntity(result.rows[0]) : null;
  }

  async getAll(): Promise<Customer[]> {
    const result = await this.pool.query(
      `SELECT id, user_id, name, government_id, tax_status, phone, address, created_at::text AS created_at
       FROM customers`,
    );
    return result.rows.map((row) => this.toEntity(row));
  }

  // update dinamico: arma el SET solo con los campos presentes en data.
  async update(
    id: string,
    data: Partial<Omit<Customer, "id" | "user_id" | "created_at">>,
  ): Promise<Customer | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${i++}`);
      values.push(data.name);
    }
    if (data.government_id !== undefined) {
      fields.push(`government_id = $${i++}`);
      values.push(data.government_id);
    }
    if (data.tax_status !== undefined) {
      fields.push(`tax_status = $${i++}`);
      values.push(data.tax_status);
    }
    if (data.phone !== undefined) {
      fields.push(`phone = $${i++}`);
      values.push(data.phone);
    }
    if (data.address !== undefined) {
      fields.push(`address = $${i++}`);
      values.push(data.address);
    }

    if (fields.length === 0) {
      return this.getById(id);
    }

    values.push(id);
    const query = `UPDATE customers SET ${fields.join(", ")} WHERE id = $${i} RETURNING id, user_id, name, government_id, tax_status, phone, address, created_at::text AS created_at`;
    const result = await this.pool.query(query, values);
    return result.rows[0] ? this.toEntity(result.rows[0]) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query(`DELETE FROM customers WHERE id = $1`, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  // Mapea la fila de PostgreSQL a la entidad Customer.
  private toEntity(row: {
    id: string;
    user_id: string;
    name: string;
    government_id: string | null;
    tax_status: string;
    phone: string | null;
    address: string | null;
    created_at: string;
  }): Customer {
    return {
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      government_id: row.government_id,
      tax_status: row.tax_status,
      phone: row.phone,
      address: row.address,
      created_at: row.created_at,
    };
  }
}
