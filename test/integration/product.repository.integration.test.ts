import { Db, MongoClient } from "mongodb";
import { MongoDBContainer } from "@testcontainers/mongodb";
import type { StartedMongoDBContainer } from "@testcontainers/mongodb";
import { ProductRepositoryMongoDB } from "../../src/product/product.repository.mongodb";
import { validProduct } from "../fixtures";

// Documento crudo de la coleccion, para leer o sembrar datos sin pasar por el repositorio.
type RawProductDoc = { _id: string; [field: string]: unknown };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("ProductRepositoryMongoDB — integración con BD real", () => {
  let mongoClient: MongoClient | undefined;
  let db: Db;
  let repository: ProductRepositoryMongoDB;
  let container: StartedMongoDBContainer | undefined;

  beforeAll(async () => {
    container = await new MongoDBContainer("mongo:6.0").withStartupTimeout(120_000).start();
    // El contenedor arranca como replica set: directConnection evita que el driver intente
    // resolver el host interno del set, que no existe fuera de Docker.
    mongoClient = new MongoClient(container.getConnectionString(), { directConnection: true });
    await mongoClient.connect();
    db = mongoClient.db("tiendabox_test");
  }, 180_000);

  // Mongo standalone no tiene un BEGIN/ROLLBACK simple: cada test arranca con la coleccion vacia.
  beforeEach(async () => {
    await db.collection("products").deleteMany({});
    repository = new ProductRepositoryMongoDB(db);
  });

  afterAll(async () => {
    try {
      if (mongoClient) await mongoClient.close();
    } finally {
      if (container) await container.stop();
    }
  }, 60_000);

  // Lee el stock directo de la base: getById oculta los productos inactivos.
  async function stockOf(id: string): Promise<number | undefined> {
    const [product] = await repository.getByIds([id]);
    return product?.stock;
  }

  it("guarda y recupera todos los datos con un id UUID generado en la app", async () => {
    const data = {
      ...validProduct,
      description: "Mecánico",
      image_url: "https://example.com/t.jpg",
    };

    const saved = await repository.create(data);
    const found = await repository.getById(saved.id);

    // El _id es un string UUID, no un ObjectId: los pedidos y carritos de Postgres lo guardan como texto.
    expect(saved.id).toMatch(UUID);
    expect(found).toEqual({ ...data, id: saved.id });
    await expect(
      db.collection<RawProductDoc>("products").findOne({ _id: saved.id }),
    ).resolves.not.toBeNull();
  });

  it("un producto por encargo conserva el precio null", async () => {
    const saved = await repository.create({
      ...validProduct,
      type: "encargo",
      price: null,
      stock: 0,
    });

    await expect(repository.getById(saved.id)).resolves.toMatchObject({
      type: "encargo",
      price: null,
    });
  });

  // Los productos cargados antes de agregar image_url no tienen el campo.
  it("lee como null los campos opcionales que faltan en documentos viejos", async () => {
    await db.collection<RawProductDoc>("products").insertOne({
      _id: "viejo",
      name: "Monitor",
      type: "stock",
      price: 300,
      stock: 3,
      category_id: "cat-1",
      brand_id: "brand-1",
      is_active: true,
    });

    await expect(repository.getById("viejo")).resolves.toMatchObject({
      image_url: null,
      description: null,
    });
  });

  it("getAll devuelve solo los activos y aplica los filtros de categoría y marca", async () => {
    const a = await repository.create({
      ...validProduct,
      category_id: "cat-1",
      brand_id: "brand-1",
    });
    const b = await repository.create({
      ...validProduct,
      category_id: "cat-1",
      brand_id: "brand-2",
    });
    const c = await repository.create({
      ...validProduct,
      category_id: "cat-2",
      brand_id: "brand-1",
    });
    await repository.create({
      ...validProduct,
      category_id: "cat-1",
      brand_id: "brand-1",
      is_active: false,
    });
    const ids = (products: { id: string }[]) => products.map((p) => p.id).sort();

    expect(ids(await repository.getAll())).toEqual([a.id, b.id, c.id].sort());
    expect(ids(await repository.getAll({ category_id: "cat-1" }))).toEqual([a.id, b.id].sort());
    expect(ids(await repository.getAll({ brand_id: "brand-1" }))).toEqual([a.id, c.id].sort());
    expect(ids(await repository.getAll({ category_id: "cat-1", brand_id: "brand-1" }))).toEqual([
      a.id,
    ]);
    await expect(repository.getAll({ category_id: "cat-inexistente" })).resolves.toEqual([]);
  });

  // A proposito: el carrito necesita ver los productos dados de baja para marcarlos como
  // no disponibles en lugar de hacerlos desaparecer.
  it("getByIds trae varios en una consulta e incluye los inactivos", async () => {
    const active = await repository.create(validProduct);
    const inactive = await repository.create({ ...validProduct, is_active: false });
    await repository.create(validProduct); // no pedido

    const found = await repository.getByIds([active.id, inactive.id, "no-existe"]);

    expect(found.map((p) => p.id).sort()).toEqual([active.id, inactive.id].sort());
    expect(found.find((p) => p.id === inactive.id)?.is_active).toBe(false);
    await expect(repository.getByIds([])).resolves.toEqual([]);
  });

  describe("decrementStock", () => {
    it("descuenta el stock cuando alcanza, incluso si la cantidad es exactamente el stock", async () => {
      const saved = await repository.create({ ...validProduct, stock: 10 });

      await expect(repository.decrementStock(saved.id, 4)).resolves.toBe(true);
      await expect(repository.decrementStock(saved.id, 6)).resolves.toBe(true);
      expect(await stockOf(saved.id)).toBe(0);
    });

    it("devuelve false y no modifica nada si la cantidad supera el stock", async () => {
      const saved = await repository.create({ ...validProduct, stock: 5 });

      await expect(repository.decrementStock(saved.id, 6)).resolves.toBe(false);
      expect(await stockOf(saved.id)).toBe(5);
    });

    it("devuelve false para un producto inactivo o inexistente", async () => {
      const inactive = await repository.create({ ...validProduct, stock: 5, is_active: false });

      await expect(repository.decrementStock(inactive.id, 1)).resolves.toBe(false);
      expect(await stockOf(inactive.id)).toBe(5);
      await expect(repository.decrementStock("no-existe", 1)).resolves.toBe(false);
    });

    // Es la razon de ser del descuento atomico: con leer-restar-escribir, varios pedidos
    // simultaneos validarian el mismo stock y lo dejarian negativo.
    it("es atómico: con pedidos simultáneos nunca vende más que el stock disponible", async () => {
      const saved = await repository.create({ ...validProduct, stock: 10 });

      const results = await Promise.all(
        Array.from({ length: 5 }, () => repository.decrementStock(saved.id, 3)),
      );

      expect(results.filter(Boolean)).toHaveLength(3);
      expect(await stockOf(saved.id)).toBe(1);
    });
  });

  it("incrementStock repone stock, también en un producto dado de baja", async () => {
    const saved = await repository.create({ ...validProduct, stock: 2 });
    await repository.decrementStock(saved.id, 2);

    await repository.incrementStock(saved.id, 2);
    expect(await stockOf(saved.id)).toBe(2);

    // Cancelar un pedido de un producto que se dio de baja despues igual devuelve el stock.
    await repository.softDelete(saved.id);
    await repository.incrementStock(saved.id, 3);
    expect(await stockOf(saved.id)).toBe(5);
  });

  it("update modifica solo los campos enviados y no toca productos inactivos", async () => {
    const saved = await repository.create(validProduct);
    const inactive = await repository.create({ ...validProduct, is_active: false });

    await expect(repository.update(saved.id, { price: 150 })).resolves.toEqual({
      ...saved,
      price: 150,
    });
    await expect(repository.update(inactive.id, { price: 150 })).resolves.toBeNull();
    expect((await repository.getByIds([inactive.id]))[0]?.price).toBe(validProduct.price);
  });

  it("softDelete marca is_active en false y después getById ya no lo encuentra", async () => {
    const saved = await repository.create(validProduct);

    await expect(repository.softDelete(saved.id)).resolves.toBe(true);

    await expect(repository.getById(saved.id)).resolves.toBeNull();
    await expect(repository.getAll()).resolves.toEqual([]);
    // No se borra: sigue existiendo para los pedidos y carritos que lo referencian.
    await expect(repository.getByIds([saved.id])).resolves.toEqual([
      { ...saved, is_active: false },
    ]);
    await expect(repository.softDelete(saved.id)).resolves.toBe(false);
  });
});
