import { Category } from "./category.entity";

// Contrato del repositorio de Category. Los ids son siempre string.
export interface ICategoryRepository {
  create(data: Omit<Category, "id">): Promise<Category>;
  getById(id: string): Promise<Category | null>;
  getAll(): Promise<Category[]>;
  update(id: string, data: Partial<Omit<Category, "id">>): Promise<Category | null>;
  delete(id: string): Promise<boolean>;
}
