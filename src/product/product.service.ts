import { Product, ProductType } from "./product.entity";
import { IProductRepository, ProductFilter } from "./product.repository.interface";
import { ValidationError } from "../errors";

const NAME_MAX_LENGTH = 100;

export class ProductService {
  constructor(private readonly repository: IProductRepository) {}

  async getAll(filter?: ProductFilter): Promise<Product[]> {
    return this.repository.getAll(filter);
  }

  async getById(id: string): Promise<Product | null> {
    return this.repository.getById(id);
  }

  async create(input: {
    name?: unknown;
    description?: unknown;
    type?: unknown;
    price?: unknown;
    stock?: unknown;
    category_id?: unknown;
    brand_id?: unknown;
  }): Promise<Product> {
    const name = this.validateName(input.name);
    const description = this.normalizeDescription(input.description);
    const type = this.validateType(input.type);
    const category_id = this.validateForeignId(input.category_id, "category_id");
    const brand_id = this.validateForeignId(input.brand_id, "brand_id");

    const { price, stock } = this.resolvePriceAndStock(
      type,
      input.price,
      input.stock,
    );

    const toCreate: Omit<Product, "id"> = {
      name,
      description,
      type,
      price,
      stock,
      category_id,
      brand_id,
      is_active: true,
    };

    return this.repository.create(toCreate);
  }

  async update(
    id: string,
    input: {
      name?: unknown;
      description?: unknown;
      type?: unknown;
      price?: unknown;
      stock?: unknown;
      category_id?: unknown;
      brand_id?: unknown;
    },
  ): Promise<Product | null> {
    const existing = await this.repository.getById(id);
    if (!existing) {
      return null;
    }

    const data: Partial<Omit<Product, "id">> = {};

    if (input.name !== undefined) {
      data.name = this.validateName(input.name);
    }

    if (input.description !== undefined) {
      data.description = this.normalizeDescription(input.description);
    }

    if (input.category_id !== undefined) {
      data.category_id = this.validateForeignId(input.category_id, "category_id");
    }

    if (input.brand_id !== undefined) {
      data.brand_id = this.validateForeignId(input.brand_id, "brand_id");
    }

    let newType: ProductType | undefined;
    if (input.type !== undefined) {
      newType = this.validateType(input.type);
      data.type = newType;
    }

    // Si el body cambia type, price o stock, revalidar coherencia.
    if (input.type !== undefined || input.price !== undefined || input.stock !== undefined) {
      const candidateType: ProductType = newType ?? existing.type;
      const { price, stock } = this.resolvePriceAndStock(
        candidateType,
        input.price,
        input.stock,
        existing.price,
        existing.stock,
      );
      data.price = price;
      data.stock = stock;
    }

    if (Object.keys(data).length === 0) {
      throw new ValidationError("El body no puede estar vacio");
    }

    return this.repository.update(id, data);
  }

  async delete(id: string): Promise<boolean> {
    return this.repository.softDelete(id);
  }

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

  private normalizeDescription(value: unknown): string | null {
    if (value === undefined || value === null) {
      return null;
    }
    if (typeof value !== "string") {
      throw new ValidationError("El campo 'description' debe ser texto");
    }
    return value;
  }

  private validateType(value: unknown): ProductType {
    if (typeof value !== "string") {
      throw new ValidationError("El campo 'type' es obligatorio");
    }
    if (value !== "stock" && value !== "encargo") {
      throw new ValidationError("El campo 'type' debe ser 'stock' o 'encargo'");
    }
    return value as ProductType;
  }

  private validateForeignId(value: unknown, fieldName: string): string {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new ValidationError(`El campo '${fieldName}' es obligatorio`);
    }
    return value.trim();
  }

  // Si type==='encargo' => price=null, stock=0 (ignora lo que venga).
  // Si type==='stock' => exige price>0 y stock>=0.
  private resolvePriceAndStock(
    type: ProductType,
    priceInput: unknown,
    stockInput: unknown,
    existingPrice?: number | null,
    existingStock?: number,
  ): { price: number | null; stock: number } {
    if (type === "encargo") {
      return { price: null, stock: 0 };
    }

    // type === 'stock'
    let price: number | null = existingPrice ?? null;
    let stock: number = existingStock ?? 0;

    if (priceInput !== undefined) {
      if (typeof priceInput !== "number" || !Number.isFinite(priceInput) || priceInput <= 0) {
        throw new ValidationError("El campo 'price' debe ser un numero mayor que 0 para productos 'stock'");
      }
      price = priceInput;
    }

    if (stockInput !== undefined) {
      if (typeof stockInput !== "number" || !Number.isFinite(stockInput) || stockInput < 0) {
        throw new ValidationError("El campo 'stock' debe ser un numero mayor o igual a 0");
      }
      stock = stockInput;
    }

    if (price === null || price === undefined) {
      throw new ValidationError("El campo 'price' es obligatorio para productos de tipo 'stock'");
    }

    return { price, stock };
  }
}
