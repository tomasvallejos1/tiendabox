import crypto from "crypto";
import { Pool } from "pg";
import { User } from "./user.entity";
import { IUserRepository } from "./user.repository.interface";

// Implementacion del repositorio que SOLO habla con PostgreSQL.
export class UserRepositoryPostgres implements IUserRepository {
  constructor(private readonly pool: Pool) {}

  async create(data: Omit<User, "id" | "created_at">): Promise<User> {
    const newId = crypto.randomUUID();
    const result = await this.pool.query(
      `INSERT INTO users (id, email, password, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, password, role, created_at::text AS created_at`,
      [newId, data.email, data.password, data.role],
    );
    return this.toEntity(result.rows[0]);
  }

  async getById(id: string): Promise<User | null> {
    const result = await this.pool.query(
      `SELECT id, email, password, role, created_at::text AS created_at
       FROM users WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.toEntity(result.rows[0]) : null;
  }

  async getByEmail(email: string): Promise<User | null> {
    const result = await this.pool.query(
      `SELECT id, email, password, role, created_at::text AS created_at
       FROM users WHERE LOWER(email) = LOWER($1)`,
      [email],
    );
    return result.rows[0] ? this.toEntity(result.rows[0]) : null;
  }

  async getAll(): Promise<User[]> {
    const result = await this.pool.query(
      `SELECT id, email, password, role, created_at::text AS created_at
       FROM users`,
    );
    return result.rows.map((row) => this.toEntity(row));
  }

  // update dinamico: arma el SET solo con los campos presentes en data.
  async update(id: string, data: Partial<Omit<User, "id" | "created_at">>): Promise<User | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (data.email !== undefined) {
      fields.push(`email = $${i++}`);
      values.push(data.email);
    }
    if (data.password !== undefined) {
      fields.push(`password = $${i++}`);
      values.push(data.password);
    }
    if (data.role !== undefined) {
      fields.push(`role = $${i++}`);
      values.push(data.role);
    }

    if (fields.length === 0) {
      return this.getById(id);
    }

    values.push(id);
    const query = `UPDATE users SET ${fields.join(", ")} WHERE id = $${i} RETURNING id, email, password, role, created_at::text AS created_at`;
    const result = await this.pool.query(query, values);
    return result.rows[0] ? this.toEntity(result.rows[0]) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query(`DELETE FROM users WHERE id = $1`, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  // Mapea la fila de PostgreSQL a la entidad User.
  private toEntity(row: {
    id: string;
    email: string;
    password: string;
    role: string;
    created_at: string;
  }): User {
    return {
      id: row.id,
      email: row.email,
      password: row.password,
      role: row.role,
      created_at: row.created_at,
    };
  }
}
