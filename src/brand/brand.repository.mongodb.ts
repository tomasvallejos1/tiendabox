import { Collection, Db, ObjectId } from 'mongodb';
import { Brand } from './brand.entity';
import { BrandRepository } from './brand.repository.interface';

export class BrandMongoRepository implements BrandRepository {
  private collection: Collection;

  constructor(db: Db) {
    this.collection = db.collection('brands');
  }

  // Utilidad para mapear _id a id de forma limpia
  private mapToBrand(doc: any): Brand {
    const { _id, ...rest } = doc;
    return { id: _id.toString(), ...rest } as Brand;
  }

  async createBrand(data: Omit<Brand, 'id'>): Promise<Brand> {
    const result = await this.collection.insertOne(data);
    return { id: result.insertedId.toString(), ...data };
  }

  async getBrands(): Promise<Brand[]> {
    const brands = await this.collection.find().toArray();
    return brands.map(this.mapToBrand);
  }

  async getBrandById(id: string): Promise<Brand | null> {
    if (!ObjectId.isValid(id)) return null;
    const brand = await this.collection.findOne({ _id: new ObjectId(id) });
    return brand ? this.mapToBrand(brand) : null;
  }

  async getBrandByName(name: string): Promise<Brand | null> {
    const brand = await this.collection.findOne({ name });
    return brand ? this.mapToBrand(brand) : null;
  }

  async updateBrand(id: string, data: Partial<Omit<Brand, 'id'>>): Promise<Brand | null> {
    if (!ObjectId.isValid(id)) return null;
    const result = await this.collection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: data },
      { returnDocument: 'after' } // Devuelve el documento actualizado
    );
    // Nota: Según la versión del driver de MongoDB, result podría ser directamente el documento o venir dentro de result.value.
    // Asumimos el driver moderno donde retorna el doc (o adaptarlo a result.value si usas MongoDB < 6)
    return result ? this.mapToBrand(result) : null;
  }

  async deleteBrand(id: string): Promise<boolean> {
    if (!ObjectId.isValid(id)) return false;
    const result = await this.collection.deleteOne({ _id: new ObjectId(id) });
    return result.deletedCount === 1;
  }
}