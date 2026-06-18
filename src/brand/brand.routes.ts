import { Router } from 'express';
import { Db } from 'mongodb';
import { BrandMongoRepository } from './brand.repository.mongodb';
import { BrandService } from './brand.service';
import { BrandController } from './brand.controller';

export function createBrandRouter(db: Db): Router {
  const router = Router();
  
  // Inyección de dependencias
  const repository = new BrandMongoRepository(db);
  const service = new BrandService(repository);
  const controller = new BrandController(service);

  // Rutas
  router.post('/', controller.createBrand);
  router.get('/', controller.getBrands);
  router.get('/:id', controller.getBrandById);
  router.put('/:id', controller.updateBrand);
  router.delete('/:id', controller.deleteBrand);

  return router;
}