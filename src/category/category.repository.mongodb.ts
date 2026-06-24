import { Collection, Db, WithId } from "mongodb";
import crypto from "crypto";
import { Category } from "./category.entity";
import { ICategoryRepository } from "./category.repository.interface";

export class CategoryRepositoryMongoDB implements ICategoryRepository {
  private readonly collection: Collection<{ _id: string; name: string; description?: string | null }>;

  constructor(db: Db) {
    this.collection = db.collection("categories");
  }

  async create(data: Omit<Category, "id">): Promise<Category> {
    const newId = crypto.randomUUID();
    
    await this.collection.insertOne({
      _id: newId,
      name: data.name,
      description: data.description,
    });
    
    return {
      id: newId,
      name: data.name,
      description: data.description,
    };
  }

  async getById(id: string): Promise<Category | null> {
    const doc = await this.collection.findOne({ _id: id });
    return doc ? this.toEntity(doc) : null;
  }

  async getByName(name: string): Promise<Category | null> {
    const doc = await this.collection.findOne({ name });
    return doc ? this.toEntity(doc) : null;
  }

  async getAll(): Promise<Category[]> {
    const docs = await this.collection.find().toArray();
    return docs.map((doc) => this.toEntity(doc as WithId<{ _id: string; name: string; description?: string | null }>));
  }

  async update(id: string, data: Partial<Omit<Category, "id">>): Promise<Category | null> {
    const result = await this.collection.findOneAndUpdate(
      { _id: id },
      { $set: data },
      { returnDocument: "after" }
    );
    const updated = (result as any)?.value ?? (result as any);
    return updated ? this.toEntity(updated as WithId<{ _id: string; name: string; description?: string | null }>) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.collection.deleteOne({ _id: id });
    return result.deletedCount === 1;
  }

  private toEntity(doc: WithId<{ _id: string; name: string; description?: string | null }>): Category {
    return {
      id: doc._id as string,
      name: doc["name"] as string,
      description: (doc["description"] ?? null) as string | null,
    };
  }

  async createIndexes(): Promise<void> {
    await this.collection.createIndex({ name: 1 }, { unique: true });
  }
}