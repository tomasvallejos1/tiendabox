import { Collection, Db, ObjectId } from 'mongodb';
import { Customer } from './customer.entity';
import { CustomerRepository } from './customer.repository.interface';

export class CustomerMongoRepository implements CustomerRepository {
  private collection: Collection;

  constructor(db: Db) {
    this.collection = db.collection('customers');
  }

  private mapToCustomer(doc: any): Customer {
    const { _id, ...rest } = doc;
    return { id: _id.toString(), ...rest } as Customer;
  }

  async createCustomer(data: Omit<Customer, 'id'>): Promise<Customer> {
    const result = await this.collection.insertOne(data);
    return { id: result.insertedId.toString(), ...data };
  }

  async getCustomers(): Promise<Customer[]> {
    const customers = await this.collection.find().toArray();
    return customers.map(this.mapToCustomer);
  }

  async getCustomerById(id: string): Promise<Customer | null> {
    if (!ObjectId.isValid(id)) return null;
    const customer = await this.collection.findOne({ _id: new ObjectId(id) });
    return customer ? this.mapToCustomer(customer) : null;
  }

  async getCustomerByEmail(email: string): Promise<Customer | null> {
    const customer = await this.collection.findOne({ email });
    return customer ? this.mapToCustomer(customer) : null;
  }

  async updateCustomer(id: string, data: Partial<Omit<Customer, 'id'>>): Promise<Customer | null> {
    if (!ObjectId.isValid(id)) return null;
    const result = await this.collection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: data },
      { returnDocument: 'after' }
    );
    return result ? this.mapToCustomer(result) : null;
  }

  async deleteCustomer(id: string): Promise<boolean> {
    if (!ObjectId.isValid(id)) return false;
    const result = await this.collection.deleteOne({ _id: new ObjectId(id) });
    return result.deletedCount === 1;
  }
}