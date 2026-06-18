import { Router } from 'express';
import { Db } from 'mongodb';
import { CustomerMongoRepository } from './customer.repository.mongodb';
import { CustomerService } from './customer.service';
import { CustomerController } from './customer.controller';

export function createCustomerRouter(db: Db): Router {
  const router = Router();
  
  const repository = new CustomerMongoRepository(db);
  const service = new CustomerService(repository);
  const controller = new CustomerController(service);

  router.post('/', controller.createCustomer);
  router.get('/', controller.getCustomers);
  router.get('/:id', controller.getCustomerById);
  router.put('/:id', controller.updateCustomer);
  router.delete('/:id', controller.deleteCustomer);

  return router;
}