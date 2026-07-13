import crypto from "crypto";
import { Pool } from "pg";
import { Session } from "./session.entity";
import { ISessionRepository } from "./session.repository.interface";

// Implementacion del repositorio de sesiones con PostgreSQL.
export class SessionRepositoryPostgres implements ISessionRepository {
  constructor(private readonly pool: Pool) {}

  async create(userId: string): Promise<Session> {
    const token = crypto.randomUUID();
    const exp = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const result = await this.pool.query(
      `INSERT INTO sessions (token, user_id, expires_at)
       VALUES ($1, $2, $3)
       RETURNING token, user_id, expires_at::text AS expires_at`,
      [token, userId, exp],
    );
    return this.toEntity(result.rows[0]);
  }

  async getByToken(token: string): Promise<Session | null> {
    const result = await this.pool.query(
      `SELECT token, user_id, expires_at::text AS expires_at
       FROM sessions WHERE token = $1`,
      [token],
    );
    return result.rows[0] ? this.toEntity(result.rows[0]) : null;
  }

  async deleteByToken(token: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM sessions WHERE token = $1`,
      [token],
    );
    return (result.rowCount ?? 0) > 0;
  }

  // Mapea la fila de PostgreSQL a la entidad Session.
  private toEntity(row: {
    token: string;
    user_id: string;
    expires_at: string;
  }): Session {
    return {
      token: row.token,
      user_id: row.user_id,
      expires_at: row.expires_at,
    };
  }
}
