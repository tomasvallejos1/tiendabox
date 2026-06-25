import { Pool } from 'pg';
import { Customer } from './customer.entity';

export class CustomerRepositoryPostgres {
  private pool: Pool;

  constructor(dbPool: Pool) {
    this.pool = dbPool;
  }

  // 1. Listar todos los clientes
  async getAll(): Promise<Customer[]> {
    const query = "SELECT id, name, email, role FROM users WHERE role = 'cliente'";
    const result = await this.pool.query(query);
    return result.rows;
  }

  // 2. Buscar un cliente por ID
  async getById(id: string): Promise<Customer | null> {
    const query = "SELECT id, name, email, role FROM users WHERE id = $1 AND role = 'cliente'";
    const result = await this.pool.query(query, [id]);
    return result.rows.length ? result.rows[0] : null;
  }

  async getByEmail(email: string): Promise<Customer | null> {
    const query = "SELECT id, name, email, role FROM users WHERE email = $1 AND role = 'cliente'";
    const result = await this.pool.query(query, [email]);
    return result.rows.length ? result.rows[0] : null;
  }

  // 3. Crear un cliente nuevo
  async create(data: Omit<Customer, 'id'>): Promise<Customer> {
    const query = `
      INSERT INTO users (name, email, password, role) 
      VALUES ($1, $2, 'sin_password', 'cliente') 
      RETURNING id, name, email, role
    `;
    const result = await this.pool.query(query, [data.name, data.email]);
    return result.rows[0];
  }

  // 4. Actualizar un cliente (Update dinámico)
  async update(id: string, data: Partial<Omit<Customer, 'id'>>): Promise<Customer | null> {
    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      fields.push(`name = $${paramIndex}`);
      values.push(data.name);
      paramIndex++;
    }

    if (data.email !== undefined) {
      fields.push(`email = $${paramIndex}`);
      values.push(data.email);
      paramIndex++;
    }

    if (fields.length === 0) {
      return this.getById(id);
    }

    const query = `
      UPDATE users SET ${fields.join(', ')} 
      WHERE id = $${paramIndex} AND role = 'cliente' 
      RETURNING id, name, email, role
    `;
    values.push(id); 

    const result = await this.pool.query(query, values);
    return result.rows.length ? result.rows[0] : null;
  }

  // 5. Eliminar un cliente
  async delete(id: string): Promise<boolean> {
    const query = "DELETE FROM users WHERE id = $1 AND role = 'cliente'";
    const result = await this.pool.query(query, [id]);
    
    return (result.rowCount ?? 0) > 0;
  }
}