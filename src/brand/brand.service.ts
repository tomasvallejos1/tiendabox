import { Brand } from './brand.entity';
import { BrandRepository } from './brand.repository.interface';

export class BrandService {
  constructor(private repo: BrandRepository) {}

  async createBrand(data: any): Promise<Brand> {
    // 1. Validar que name exista y no esté vacío
    if (!data.name || typeof data.name !== 'string' || data.name.trim() === '') {
      throw new Error('BAD_REQUEST: El nombre de la marca es obligatorio.');
    }
    // 2. Validar largo máximo de 100 caracteres
    if (data.name.length > 100) {
      throw new Error('BAD_REQUEST: El nombre no puede superar los 100 caracteres.');
    }
    // 3. Validar unicidad
    const existingBrand = await this.repo.getBrandByName(data.name);
    if (existingBrand) {
      throw new Error('BAD_REQUEST: Ya existe una marca con ese nombre.');
    }

    const newBrandData = {
      name: data.name,
      logo_url: data.logo_url || null, // Opcional
    };

    return await this.repo.createBrand(newBrandData);
  }

  async getBrands(): Promise<Brand[]> {
    return await this.repo.getBrands();
  }

  async getBrandById(id: string): Promise<Brand> {
    const brand = await this.repo.getBrandById(id);
    if (!brand) throw new Error('NOT_FOUND: Marca no encontrada.');
    return brand;
  }

  async updateBrand(id: string, data: any): Promise<Brand> {
    // 1. Validar que el body no esté vacío
    if (!data || Object.keys(data).length === 0) {
      throw new Error('BAD_REQUEST: El cuerpo de la petición no puede estar vacío.');
    }

    // 2. Si están modificando el name, aplicamos las mismas reglas
    if (data.name !== undefined) {
      if (typeof data.name !== 'string' || data.name.trim() === '') {
        throw new Error('BAD_REQUEST: El nombre no puede estar vacío.');
      }
      if (data.name.length > 100) {
        throw new Error('BAD_REQUEST: El nombre no puede superar los 100 caracteres.');
      }
      const existingBrand = await this.repo.getBrandByName(data.name);
      // Validamos que no colisione con el nombre de OTRA marca distinta
      if (existingBrand && existingBrand.id !== id) {
        throw new Error('BAD_REQUEST: Ya existe otra marca con ese nombre.');
      }
    }

    const updateData: Partial<Omit<Brand, 'id'>> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.logo_url !== undefined) updateData.logo_url = data.logo_url;

    const updatedBrand = await this.repo.updateBrand(id, updateData);
    if (!updatedBrand) throw new Error('NOT_FOUND: Marca no encontrada.');
    
    return updatedBrand;
  }

  async deleteBrand(id: string): Promise<void> {
    const deleted = await this.repo.deleteBrand(id);
    if (!deleted) throw new Error('NOT_FOUND: Marca no encontrada.');
  }
}