import { Collection, Db, ObjectId, WithId, Document } from "mongodb";
import { Brand } from "./brand.entity";
import { IBrandRepository } from "./brand.repository.interface";

// Implementacion del repositorio que SOLO habla con MongoDB.
export class BrandMongoRepository implements IBrandRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection("brands");
  }

  async create(data: Omit<Brand, "id">): Promise<Brand> {
    const result = await this.collection.insertOne({
      name: data.name,
      logo_url: data.logo_url,
    });
    return {
      id: result.insertedId.toString(),
      name: data.name,
      logo_url: data.logo_url,
    };
  }

  async getById(id: string): Promise<Brand | null> {
    if (!ObjectId.isValid(id)) {
      return null;
    }
    const doc = await this.collection.findOne({ _id: new ObjectId(id) });
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
    if (!ObjectId.isValid(id)) {
      return null;
    }
    const doc = await this.collection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: data },
      { returnDocument: "after" },
    );
    return doc ? this.toEntity(doc) : null;
  }

  async delete(id: string): Promise<boolean> {
    if (!ObjectId.isValid(id)) {
      return false;
    }
    const result = await this.collection.deleteOne({ _id: new ObjectId(id) });
    return result.deletedCount === 1;
  }

  // Mapea el documento de Mongo (_id ObjectId) a la entidad (id string).
  private toEntity(doc: WithId<Document>): Brand {
    return {
      id: doc._id.toString(),
      name: doc["name"] as string,
      logo_url: (doc["logo_url"] ?? null) as string | null,
    };
  }
}
