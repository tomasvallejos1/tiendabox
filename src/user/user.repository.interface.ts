import { User } from "./user.entity";

// Contrato del repositorio de User. Los ids son siempre string.
export interface IUserRepository {
  create(data: Omit<User, "id" | "created_at">): Promise<User>;
  getById(id: string): Promise<User | null>;
  getByEmail(email: string): Promise<User | null>;
  getAll(): Promise<User[]>;
  update(id: string, data: Partial<Omit<User, "id" | "created_at">>): Promise<User | null>;
  delete(id: string): Promise<boolean>;
}
