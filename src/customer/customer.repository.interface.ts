import { Customer } from './customer.entity';

export interface CustomerRepository {
  createCustomer(data: Omit<Customer, 'id'>): Promise<Customer>;
  getCustomers(): Promise<Customer[]>;
  getCustomerById(id: string): Promise<Customer | null>;
  getCustomerByEmail(email: string): Promise<Customer | null>;
  updateCustomer(id: string, data: Partial<Omit<Customer, 'id'>>): Promise<Customer | null>;
  deleteCustomer(id: string): Promise<boolean>;
}