import crypto from "crypto";
import { Collection, Db } from "mongodb";
import { Category } from "./category.entity";
import { ICategoryRepository } from "./category.repository.interface";

type CategoryDoc = { _id: string; name: string; description?: string | null };

// Implementacion del repositorio que SOLO habla con MongoDB.
export class CategoryRepositoryMongoDB implements ICategoryRepository {
  private readonly collection: Collection<CategoryDoc>;

  constructor(db: Db) {
    this.collection = db.collection<CategoryDoc>("categories");
  }

  async create(data: Omit<Category, "id">): Promise<Category> {
    const newId = crypto.randomUUID();
    await this.collection.insertOne({
      _id: newId,
      name: data.name,
      description: data.description,
    });
    return { id: newId, ...data };
  }

  async getById(id: string): Promise<Category | null> {
    const doc = await this.collection.findOne({ _id: id });
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

  async update(id: string, data: Partial<Omit<Category, "id">>): Promise<Category | null> {
    await this.collection.updateOne({ _id: id }, { $set: data });
    return this.getById(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.collection.deleteOne({ _id: id });
    return result.deletedCount === 1;
  }

  // Indice unico case-insensitive sobre name: integridad ante carreras concurrentes.
  async createIndexes(): Promise<void> {
    await this.collection.createIndex(
      { name: 1 },
      { unique: true, collation: { locale: "es", strength: 2 } },
    );
  }

  // Mapea el documento de Mongo (_id string) a la entidad (id string).
  private toEntity(doc: CategoryDoc): Category {
    return {
      id: doc._id,
      name: doc.name,
      description: doc.description ?? null,
    };
  }
}
