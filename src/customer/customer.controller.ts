import { Request, Response } from 'express';
import { CustomerService } from './customer.service';

export class CustomerController {
  constructor(private service: CustomerService) {}

  createCustomer = async (req: Request, res: Response): Promise<void> => {
    try {
      const customer = await this.service.createCustomer(req.body);
      res.status(201).json(customer);
    } catch (error: any) {
      res.status(400).json({ message: error.message.replace('BAD_REQUEST: ', '') });
    }
  };

  getCustomers = async (req: Request, res: Response): Promise<void> => {
    try {
      const customers = await this.service.getCustomers();
      res.status(200).json(customers);
    } catch (error: any) {
      res.status(500).json({ message: 'Error interno del servidor' });
    }
  };

  getCustomerById = async (req: Request, res: Response): Promise<void> => {
    try {
      const customer = await this.service.getCustomerById(req.params["id"] as string);
      res.status(200).json(customer);
    } catch (error: any) {
      res.status(404).json({ message: error.message.replace('NOT_FOUND: ', '') });
    }
  };

  updateCustomer = async (req: Request, res: Response): Promise<void> => {
    try {
      const customer = await this.service.updateCustomer(req.params["id"] as string, req.body);
      res.status(200).json(customer);
    } catch (error: any) {
      if (error.message.includes('NOT_FOUND')) {
        res.status(404).json({ message: error.message.replace('NOT_FOUND: ', '') });
      } else {
        res.status(400).json({ message: error.message.replace('BAD_REQUEST: ', '') });
      }
    }
  };

  deleteCustomer = async (req: Request, res: Response): Promise<void> => {
    try {
      await this.service.deleteCustomer(req.params["id"] as string);
      res.status(204).send(); 
    } catch (error: any) {
      res.status(404).json({ message: error.message.replace('NOT_FOUND: ', '') });
    }
  };
}