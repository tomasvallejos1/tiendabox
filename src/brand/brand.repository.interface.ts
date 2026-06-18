import { Brand } from "./brand.entity";

// Contrato del repositorio de Brand. Los ids son siempre string.
export interface IBrandRepository {
  create(data: Omit<Brand, "id">): Promise<Brand>;
  getById(id: string): Promise<Brand | null>;
  getByName(name: string): Promise<Brand | null>;
  getAll(): Promise<Brand[]>;
  update(id: string, data: Partial<Omit<Brand, "id">>): Promise<Brand | null>;
  delete(id: string): Promise<boolean>;
}
