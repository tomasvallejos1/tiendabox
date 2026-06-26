import crypto from "crypto";
import { Collection, Db } from "mongodb";
import { Brand } from "./brand.entity";
import { IBrandRepository } from "./brand.repository.interface";

type BrandDoc = { _id: string; name: string; logo_url?: string | null };

// Implementacion del repositorio que SOLO habla con MongoDB.
export class BrandMongoRepository implements IBrandRepository {
  private readonly collection: Collection<BrandDoc>;

  constructor(db: Db) {
    this.collection = db.collection<BrandDoc>("brands");
  }

  async create(data: Omit<Brand, "id">): Promise<Brand> {
    const newId = crypto.randomUUID();
    await this.collection.insertOne({
      _id: newId,
      name: data.name,
      logo_url: data.logo_url,
    });
    return { id: newId, ...data };
  }

  async getById(id: string): Promise<Brand | null> {
    const doc = await this.collection.findOne({ _id: id });
    return doc ? this.toEntity(doc) : null;
  }

  // Busqueda por nombre sin distinguir mayusculas/minusculas (collation strength 2).
  async getByName(name: string): Promise<Brand | null> {
    const doc = await this.collection.findOne(
      { name },
      { collation: { locale: "es", strength: 2 } },
    );
    return doc ? this.toEntity(doc) : null;
  }

  async getAll(): Promise<Brand[]> {
    const docs = await this.collection.find().toArray();
    return docs.map((doc) => this.toEntity(doc));
  }

  async update(id: string, data: Partial<Omit<Brand, "id">>): Promise<Brand | null> {
    await this.collection.updateOne({ _id: id }, { $set: data });
    return this.getById(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.collection.deleteOne({ _id: id });
    return result.deletedCount === 1;
  }

  // Mapea el documento de Mongo (_id string) a la entidad (id string).
  private toEntity(doc: BrandDoc): Brand {
    return {
      id: doc._id,
      name: doc.name,
      logo_url: doc.logo_url ?? null,
    };
  }
}
