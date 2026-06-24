import { Collection, Db, WithId } from "mongodb";
import crypto from "crypto";
import { Brand } from "./brand.entity";
import { IBrandRepository } from "./brand.repository.interface";

export class BrandRepositoryMongoDB implements IBrandRepository {
  private readonly collection: Collection<{ _id: string; name: string; logo_url?: string | null }>;

  constructor(db: Db) {
    this.collection = db.collection("brands");
  }

  async create(data: Omit<Brand, "id">): Promise<Brand> {
    const newId = crypto.randomUUID();
    
    await this.collection.insertOne({
      _id: newId,
      name: data.name,
      logo_url: data.logo_url,
    });
    
    return {
      id: newId,
      name: data.name,
      logo_url: data.logo_url,
    };
  }

  async getById(id: string): Promise<Brand | null> {
    const doc = await this.collection.findOne({ _id: id });
    return doc ? this.toEntity(doc) : null;
  }

  async getByName(name: string): Promise<Brand | null> {
    const doc = await this.collection.findOne({ name });
    return doc ? this.toEntity(doc) : null;
  }

  async getAll(): Promise<Brand[]> {
    const docs = await this.collection.find().toArray();
    return docs.map((doc) => this.toEntity(doc as WithId<{ _id: string; name: string; logo_url?: string | null }>));
  }

  async update(id: string, data: Partial<Omit<Brand, "id">>): Promise<Brand | null> {
    const result = await this.collection.findOneAndUpdate(
      { _id: id },
      { $set: data },
      { returnDocument: "after" }
    );
    const updated = (result as any)?.value ?? (result as any);
    return updated ? this.toEntity(updated as WithId<{ _id: string; name: string; logo_url?: string | null }>) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.collection.deleteOne({ _id: id });
    return result.deletedCount === 1;
  }

  private toEntity(doc: WithId<{ _id: string; name: string; logo_url?: string | null }>): Brand {
    return {
      id: doc._id as string,
      name: doc["name"] as string,
      logo_url: (doc["logo_url"] ?? null) as string | null,
    };
  }
}