import { Customer } from "./customer.entity";

export interface ICustomerRepository {
  create(data: Omit<Customer, "id" | "created_at">): Promise<Customer>;
  getById(id: string): Promise<Customer | null>;
  getByUserId(userId: string): Promise<Customer | null>;
  getAll(): Promise<Customer[]>;
  update(
    id: string,
    data: Partial<Omit<Customer, "id" | "user_id" | "created_at">>,
  ): Promise<Customer | null>;
  delete(id: string): Promise<boolean>;
}
