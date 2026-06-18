import { Collection, Db, ObjectId, WithId, Document } from "mongodb";
import { Product, ProductType } from "./product.entity";
import { IProductRepository, ProductFilter } from "./product.repository.interface";

export class ProductRepositoryMongoDB implements IProductRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection("products");
  }

  async create(data: Omit<Product, "id">): Promise<Product> {
    const result = await this.collection.insertOne({
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
      id: result.insertedId.toString(),
      name: data.name,
      description: data.description,
      type: data.type,
      price: data.price,
      stock: data.stock,
      category_id: data.category_id,
      brand_id: data.brand_id,
      is_active: data.is_active,
    };
  }

  async getById(id: string): Promise<Product | null> {
    if (!ObjectId.isValid(id)) {
      return null;
    }
    const doc = await this.collection.findOne({
      _id: new ObjectId(id),
      is_active: true,
    });
    return doc ? this.toEntity(doc) : null;
  }

  // getAll arma el query dinamicamente: siempre is_active:true, y suma filtros si vienen.
  async getAll(filter?: ProductFilter): Promise<Product[]> {
    const query: Document = { is_active: true };
    if (filter?.category_id) {
      query["category_id"] = filter.category_id;
    }
    if (filter?.brand_id) {
      query["brand_id"] = filter.brand_id;
    }
    const docs = await this.collection.find(query).toArray();
    return docs.map((doc) => this.toEntity(doc as WithId<Document>));
  }

  async update(id: string, data: Partial<Omit<Product, "id">>): Promise<Product | null> {
    if (!ObjectId.isValid(id)) {
      return null;
    }
    const doc = await this.collection.findOneAndUpdate(
      { _id: new ObjectId(id), is_active: true },
      { $set: data },
      { returnDocument: "after" },
    );
    return doc ? this.toEntity(doc as unknown as WithId<Document>) : null;
  }

  // Soft delete: marca is_active:false en lugar de borrar.
  async softDelete(id: string): Promise<boolean> {
    if (!ObjectId.isValid(id)) {
      return false;
    }
    const result = await this.collection.updateOne(
      { _id: new ObjectId(id), is_active: true },
      { $set: { is_active: false } },
    );
    return result.modifiedCount === 1;
  }

  private toEntity(doc: WithId<Document>): Product {
    return {
      id: doc._id.toString(),
      name: doc["name"] as string,
      description: (doc["description"] ?? null) as string | null,
      type: doc["type"] as ProductType,
      price: (doc["price"] ?? null) as number | null,
      stock: (doc["stock"] ?? 0) as number,
      category_id: doc["category_id"] as string,
      brand_id: doc["brand_id"] as string,
      is_active: Boolean(doc["is_active"]),
    };
  }
}
