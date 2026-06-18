import { Brand } from './brand.entity';

export interface BrandRepository {
  createBrand(data: Omit<Brand, 'id'>): Promise<Brand>;
  getBrands(): Promise<Brand[]>;
  getBrandById(id: string): Promise<Brand | null>;
  getBrandByName(name: string): Promise<Brand | null>;
  updateBrand(id: string, data: Partial<Omit<Brand, 'id'>>): Promise<Brand | null>;
  deleteBrand(id: string): Promise<boolean>;
}