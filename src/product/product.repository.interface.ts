import { Product } from "./product.entity";

export interface ProductFilter {
  category_id?: string;
  brand_id?: string;
}

// Contrato del repositorio de Product. Los ids son string.
export interface IProductRepository {
  create(data: Omit<Product, "id">): Promise<Product>;
  getById(id: string): Promise<Product | null>;
  getAll(filter?: ProductFilter): Promise<Product[]>;
  update(id: string, data: Partial<Omit<Product, "id">>): Promise<Product | null>;
  // Soft delete: inactiva el producto en lugar de borrarlo fisicamente
  softDelete(id: string): Promise<boolean>;
}
