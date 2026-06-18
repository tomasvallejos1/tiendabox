import { Brand } from "./brand.entity";
import { IBrandRepository } from "./brand.repository.interface";
import { ConflictError, ValidationError } from "../errors";

const NAME_MAX_LENGTH = 100;

// Reglas de negocio de Brand. Delega la persistencia en el repositorio.
export class BrandService {
  constructor(private readonly repository: IBrandRepository) {}

  async getAll(): Promise<Brand[]> {
    return this.repository.getAll();
  }

  async getById(id: string): Promise<Brand | null> {
    return this.repository.getById(id);
  }

  async create(input: { name?: unknown; logo_url?: unknown }): Promise<Brand> {
    const name = this.validateName(input.name);
    const logo_url = this.normalizeLogoUrl(input.logo_url);
    await this.ensureNameIsUnique(name);
    return this.repository.create({ name, logo_url });
  }

  async update(id: string, input: { name?: unknown; logo_url?: unknown }): Promise<Brand | null> {
    const data: Partial<Omit<Brand, "id">> = {};

    if (input.name !== undefined) {
      data.name = this.validateName(input.name);
    }
    if (input.logo_url !== undefined) {
      data.logo_url = this.normalizeLogoUrl(input.logo_url);
    }

    if (Object.keys(data).length === 0) {
      throw new ValidationError("El body no puede estar vacío");
    }

    if (data.name !== undefined) {
      await this.ensureNameIsUnique(data.name, id);
    }

    return this.repository.update(id, data);
  }

  async delete(id: string): Promise<boolean> {
    return this.repository.delete(id);
  }

  // Rechaza nombres ya usados por otra marca (case-insensitive).
  // excludeId permite que una marca conserve su propio nombre al actualizar.
  private async ensureNameIsUnique(name: string, excludeId?: string): Promise<void> {
    const existing = await this.repository.getByName(name);
    if (existing && existing.id !== excludeId) {
      throw new ConflictError(`Ya existe una marca con el nombre '${name}'`);
    }
  }

  // name obligatorio, string, no vacio y de maximo 100 caracteres
  private validateName(value: unknown): string {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new ValidationError("El campo 'name' es obligatorio");
    }
    const name = value.trim();
    if (name.length > NAME_MAX_LENGTH) {
      throw new ValidationError(
        `El campo 'name' no puede superar los ${NAME_MAX_LENGTH} caracteres`,
      );
    }
    return name;
  }

  // logo_url opcional: string o null
  private normalizeLogoUrl(value: unknown): string | null {
    if (value === undefined || value === null) {
      return null;
    }
    if (typeof value !== "string") {
      throw new ValidationError("El campo 'logo_url' debe ser texto");
    }
    return value;
  }
}
