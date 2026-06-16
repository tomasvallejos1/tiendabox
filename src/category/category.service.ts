import { Category } from "./category.entity";
import { ICategoryRepository } from "./category.repository.interface";
import { ValidationError } from "../errors";

const NAME_MAX_LENGTH = 100;

// Reglas de negocio de Category. Delega la persistencia en el repositorio.
export class CategoryService {
  constructor(private readonly repository: ICategoryRepository) {}

  async getAll(): Promise<Category[]> {
    return this.repository.getAll();
  }

  async getById(id: string): Promise<Category | null> {
    return this.repository.getById(id);
  }

  async create(input: { name?: unknown; description?: unknown }): Promise<Category> {
    const name = this.validateName(input.name);
    const description = this.normalizeDescription(input.description);
    return this.repository.create({ name, description });
  }

  async update(
    id: string,
    input: { name?: unknown; description?: unknown },
  ): Promise<Category | null> {
    const data: Partial<Omit<Category, "id">> = {};

    if (input.name !== undefined) {
      data.name = this.validateName(input.name);
    }
    if (input.description !== undefined) {
      data.description = this.normalizeDescription(input.description);
    }

    if (Object.keys(data).length === 0) {
      throw new ValidationError("El body no puede estar vacio");
    }

    return this.repository.update(id, data);
  }

  async delete(id: string): Promise<boolean> {
    return this.repository.delete(id);
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

  // description opcional: string o null
  private normalizeDescription(value: unknown): string | null {
    if (value === undefined || value === null) {
      return null;
    }
    if (typeof value !== "string") {
      throw new ValidationError("El campo 'description' debe ser texto");
    }
    return value;
  }
}
