import { Customer } from "./customer.entity";

export interface ICustomerRepository {
  create(data: Omit<Customer, "id">): Promise<Customer>;
  getById(id: string): Promise<Customer | null>;
  getByEmail(email: string): Promise<Customer | null>;
  getByUserId(userId: string): Promise<Customer | null>;
  getAll(): Promise<Customer[]>;
  update(id: string, data: Partial<Omit<Customer, "id">>): Promise<Customer | null>;
  delete(id: string): Promise<boolean>;
}
