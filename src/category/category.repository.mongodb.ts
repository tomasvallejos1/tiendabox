import { Collection, Db, ObjectId, WithId, Document } from "mongodb";
import { Category } from "./category.entity";
import { ICategoryRepository } from "./category.repository.interface";

// Implementacion del repositorio que SOLO habla con MongoDB.
export class CategoryRepositoryMongoDB implements ICategoryRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection("categories");
  }

  async create(data: Omit<Category, "id">): Promise<Category> {
    const result = await this.collection.insertOne({
      name: data.name,
      description: data.description,
    });
    return {
      id: result.insertedId.toString(),
      name: data.name,
      description: data.description,
    };
  }

  async getById(id: string): Promise<Category | null> {
    if (!ObjectId.isValid(id)) {
      return null;
    }
    const doc = await this.collection.findOne({ _id: new ObjectId(id) });
    return doc ? this.toEntity(doc) : null;
  }

  // Busqueda por nombre sin distinguir mayusculas/minusculas (collation strength 2).
  async getByName(name: string): Promise<Category | null> {
    const doc = await this.collection.findOne(
      { name },
      { collation: { locale: "es", strength: 2 } },
    );
    return doc ? this.toEntity(doc) : null;
  }

  async getAll(): Promise<Category[]> {
    const docs = await this.collection.find().toArray();
    return docs.map((doc) => this.toEntity(doc));
  }

  async update(
    id: string,
    data: Partial<Omit<Category, "id">>,
  ): Promise<Category | null> {
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

  // Indice unico case-insensitive sobre name: integridad ante carreras concurrentes.
  async createIndexes(): Promise<void> {
    await this.collection.createIndex(
      { name: 1 },
      { unique: true, collation: { locale: "es", strength: 2 } },
    );
  }

  // Mapea el documento de Mongo (_id ObjectId) a la entidad (id string).
  private toEntity(doc: WithId<Document>): Category {
    return {
      id: doc._id.toString(),
      name: doc["name"] as string,
      description: (doc["description"] ?? null) as string | null,
    };
  }
}
