import crypto from "crypto";
import { Collection, Db, Filter } from "mongodb";
import { Product, ProductType } from "./product.entity";
import { IProductRepository, ProductFilter } from "./product.repository.interface";

type ProductDoc = {
  _id: string;
  name: string;
  description?: string | null;
  type: ProductType;
  price?: number | null;
  stock?: number;
  category_id: string;
  brand_id: string;
  is_active: boolean;
};

export class ProductRepositoryMongoDB implements IProductRepository {
  private readonly collection: Collection<ProductDoc>;

  constructor(db: Db) {
    this.collection = db.collection<ProductDoc>("products");
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
    return { id: newId, ...data };
  }

  async getById(id: string): Promise<Product | null> {
    const doc = await this.collection.findOne({
      _id: id,
      is_active: true,
    });
    return doc ? this.toEntity(doc) : null;
  }

  // getAll arma el query dinamicamente: siempre is_active:true, y suma filtros si vienen.
  async getAll(filter?: ProductFilter): Promise<Product[]> {
    const query: Filter<ProductDoc> = { is_active: true };
    if (filter?.category_id) {
      query.category_id = filter.category_id;
    }
    if (filter?.brand_id) {
      query.brand_id = filter.brand_id;
    }
    const docs = await this.collection.find(query).toArray();
    return docs.map((doc) => this.toEntity(doc));
  }

  async update(id: string, data: Partial<Omit<Product, "id">>): Promise<Product | null> {
    await this.collection.updateOne({ _id: id, is_active: true }, { $set: data });
    return this.getById(id);
  }

  // Soft delete: marca is_active:false en lugar de borrar.
  async softDelete(id: string): Promise<boolean> {
    const result = await this.collection.updateOne(
      { _id: id, is_active: true },
      { $set: { is_active: false } },
    );
    return result.modifiedCount === 1;
  }

  private toEntity(doc: ProductDoc): Product {
    return {
      id: doc._id,
      name: doc.name,
      description: doc.description ?? null,
      type: doc.type,
      price: doc.price ?? null,
      stock: doc.stock ?? 0,
      category_id: doc.category_id,
      brand_id: doc.brand_id,
      is_active: Boolean(doc.is_active),
    };
  }
}
