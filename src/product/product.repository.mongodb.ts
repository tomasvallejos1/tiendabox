import { Collection, Db, WithId } from "mongodb";
import crypto from "crypto";
import { Product, ProductType } from "./product.entity";
import { IProductRepository, ProductFilter } from "./product.repository.interface";

type ProductDocument = {
  _id: string;
  name: string;
  description?: string | null;
  type: ProductType;
  price?: number | null;
  stock: number;
  category_id: string;
  brand_id: string;
  is_active: boolean;
};

export class ProductRepositoryMongoDB implements IProductRepository {
  private readonly collection: Collection<ProductDocument>;

  constructor(db: Db) {
    this.collection = db.collection("products");
  }

  async create(data: Omit<Product, "id">): Promise<Product> {
    const newId = crypto.randomUUID();
    
    await this.collection.insertOne({
      _id: newId,
      name: data.name,
      description: data.description,
      type: data.type,
      price: data.price,
      stock: data.stock,
      category_id: data.category_id,
      brand_id: data.brand_id,
      is_active: data.is_active,
    });
    
    return {
      id: newId,
      ...data,
    };
  }

  async getById(id: string): Promise<Product | null> {
    // Borrada la validación de ObjectId. Búsqueda directa por string.
    const doc = await this.collection.findOne({
      _id: id,
      is_active: true,
    });
    return doc ? this.toEntity(doc) : null;
  }

  async getAll(filter?: ProductFilter): Promise<Product[]> {
    const query: Partial<ProductDocument> = { is_active: true };
    if (filter?.category_id) {
      query.category_id = filter.category_id;
    }
    if (filter?.brand_id) {
      query.brand_id = filter.brand_id;
    }
    const docs = await this.collection.find(query).toArray();
    return docs.map((doc) => this.toEntity(doc as WithId<ProductDocument>));
  }

  async update(id: string, data: Partial<Omit<Product, "id">>): Promise<Product | null> {
    const result = await this.collection.findOneAndUpdate(
      { _id: id, is_active: true },
      { $set: data },
      { returnDocument: "after" },
    );
    const updated = (result as any)?.value ?? (result as any);
    return updated ? this.toEntity(updated as WithId<ProductDocument>) : null;
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await this.collection.updateOne(
      { _id: id },
      { $set: { is_active: false } },
    );
    return result.modifiedCount === 1;
  }

  private toEntity(doc: WithId<ProductDocument>): Product {
    return {
      id: doc._id,
      name: doc["name"],
      description: (doc["description"] ?? null) as string | null,
      type: doc["type"],
      price: (doc["price"] ?? null) as number | null,
      stock: doc["stock"],
      category_id: doc["category_id"],
      brand_id: doc["brand_id"],
      is_active: doc["is_active"],
    };
  }
}