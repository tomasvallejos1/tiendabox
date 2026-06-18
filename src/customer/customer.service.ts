import { Customer } from './customer.entity';
import { CustomerRepository } from './customer.repository.interface';

export class CustomerService {
  constructor(private repo: CustomerRepository) {}

  async createCustomer(data: any): Promise<Customer> {
    // 1. Validar nombre
    if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
      throw new Error('BAD_REQUEST: El nombre del cliente es obligatorio.');
    }
    
    // 2. Validar email (existencia y formato con @)
    if (!data.email || typeof data.email !== 'string' || !data.email.includes('@')) {
      throw new Error('BAD_REQUEST: Debe proporcionar un email válido.');
    }

    // 3. Validar unicidad del email
    const existingCustomer = await this.repo.getCustomerByEmail(data.email);
    if (existingCustomer) {
      throw new Error('BAD_REQUEST: Ya existe un cliente con ese email.');
    }

    // 4. Armar el objeto forzando el rol
    const newCustomerData = {
      name: data.name,
      email: data.email,
      role: 'cliente' // Hardcodeado según las reglas de negocio
    };

    return await this.repo.createCustomer(newCustomerData);
  }

  async getCustomers(): Promise<Customer[]> {
    return await this.repo.getCustomers();
  }

  async getCustomerById(id: string): Promise<Customer> {
    const customer = await this.repo.getCustomerById(id);
    if (!customer) throw new Error('NOT_FOUND: Cliente no encontrado.');
    return customer;
  }

  async updateCustomer(id: string, data: any): Promise<Customer> {
    // 1. Validar body no vacío
    if (!data || Object.keys(data).length === 0) {
      throw new Error('BAD_REQUEST: El cuerpo de la petición no puede estar vacío.');
    }

    // 2. Si cambian el email, validar formato y unicidad
    if (data.email !== undefined) {
      if (typeof data.email !== 'string' || !data.email.includes('@')) {
        throw new Error('BAD_REQUEST: El email proporcionado no es válido.');
      }
      const existingCustomer = await this.repo.getCustomerByEmail(data.email);
      if (existingCustomer && existingCustomer.id !== id) {
        throw new Error('BAD_REQUEST: El email ya está en uso por otro cliente.');
      }
    }

    // 3. Si mandan un nombre, que no esté vacío
    if (data.name !== undefined && (typeof data.name !== 'string' || data.name.trim() === '')) {
       throw new Error('BAD_REQUEST: El nombre no puede estar vacío.');
    }

    // Nota: El service ignora silenciosamente si el front intenta mandar un "role" distinto
    const updateData: Partial<Omit<Customer, 'id'>> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.email !== undefined) updateData.email = data.email;

    const updatedCustomer = await this.repo.updateCustomer(id, updateData);
    if (!updatedCustomer) throw new Error('NOT_FOUND: Cliente no encontrado.');
    
    return updatedCustomer;
  }

  async deleteCustomer(id: string): Promise<void> {
    const deleted = await this.repo.deleteCustomer(id);
    if (!deleted) throw new Error('NOT_FOUND: Cliente no encontrado.');
  }
}