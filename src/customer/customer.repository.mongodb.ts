import crypto from "crypto";
import { Collection, Db } from "mongodb";
import { Customer } from "./customer.entity";
import { ICustomerRepository } from "./customer.repository.interface";

type CustomerDoc = { _id: string; name: string; email: string; role: string; user_id?: string };

export class CustomerMongoRepository implements ICustomerRepository {
  private readonly collection: Collection<CustomerDoc>;

  constructor(db: Db) {
    this.collection = db.collection<CustomerDoc>("customers");
  }

  async create(data: Omit<Customer, "id">): Promise<Customer> {
    const newId = crypto.randomUUID();
    await this.collection.insertOne({
      _id: newId,
      name: data.name,
      email: data.email,
      role: data.role,
      ...(data.user_id != null && { user_id: data.user_id }),
    });
    return { id: newId, ...data };
  }

  async getById(id: string): Promise<Customer | null> {
    const doc = await this.collection.findOne({ _id: id });
    return doc ? this.toEntity(doc) : null;
  }

  async getByUserId(userId: string): Promise<Customer | null> {
    const doc = await this.collection.findOne({ user_id: userId });
    return doc ? this.toEntity(doc) : null;
  }

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
    const fields = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== undefined),
    ) as Partial<CustomerDoc>;
    await this.collection.updateOne({ _id: id }, { $set: fields });
    return this.getById(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.collection.deleteOne({ _id: id });
    return result.deletedCount === 1;
  }

  private toEntity(doc: CustomerDoc): Customer {
    return {
      id: doc._id,
      name: doc.name,
      email: doc.email,
      role: doc.role,
      user_id: doc["user_id"] as string | undefined,
    };
  }
}
