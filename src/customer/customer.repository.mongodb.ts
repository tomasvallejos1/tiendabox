import { Collection, Db, ObjectId, WithId, Document } from "mongodb";
import { Customer } from "./customer.entity";
import { ICustomerRepository } from "./customer.repository.interface";

// Implementacion del repositorio que SOLO habla con MongoDB.
export class CustomerMongoRepository implements ICustomerRepository {
  private readonly collection: Collection<Document>;

  constructor(db: Db) {
    this.collection = db.collection("customers");
  }

  async create(data: Omit<Customer, "id">): Promise<Customer> {
    const result = await this.collection.insertOne({
      name: data.name,
      email: data.email,
      role: data.role,
    });
    return {
      id: result.insertedId.toString(),
      name: data.name,
      email: data.email,
      role: data.role,
    };
  }

  async getById(id: string): Promise<Customer | null> {
    if (!ObjectId.isValid(id)) {
      return null;
    }
    const doc = await this.collection.findOne({ _id: new ObjectId(id) });
    return doc ? this.toEntity(doc) : null;
  }

  // Busqueda por email sin distinguir mayusculas/minusculas (collation strength 2).
  async getByEmail(email: string): Promise<Customer | null> {
    const doc = await this.collection.findOne(
      { email },
      { collation: { locale: "es", strength: 2 } },
    );
    return doc ? this.toEntity(doc) : null;
  }

  async getAll(): Promise<Customer[]> {
    const docs = await this.collection.find().toArray();
    return docs.map((doc) => this.toEntity(doc));
  }

  async update(id: string, data: Partial<Omit<Customer, "id">>): Promise<Customer | null> {
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
  private toEntity(doc: WithId<Document>): Customer {
    return {
      id: doc._id.toString(),
      name: doc["name"] as string,
      email: doc["email"] as string,
      role: doc["role"] as string,
    };
  }
}
