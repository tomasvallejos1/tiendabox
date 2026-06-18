import { Request, Response } from 'express';
import { BrandService } from './brand.service';

export class BrandController {
  constructor(private service: BrandService) {}

  createBrand = async (req: Request, res: Response): Promise<void> => {
    try {
      const brand = await this.service.createBrand(req.body);
      res.status(201).json(brand);
    } catch (error: any) {
      res.status(400).json({ message: error.message.replace('BAD_REQUEST: ', '') });
    }
  };

  getBrands = async (req: Request, res: Response): Promise<void> => {
    try {
      const brands = await this.service.getBrands();
      res.status(200).json(brands);
    } catch (error: any) {
      res.status(500).json({ message: 'Error interno del servidor' });
    }
  };

  getBrandById = async (req: Request, res: Response): Promise<void> => {
    try {
      const brand = await this.service.getBrandById(req.params["id"] as string);
      res.status(200).json(brand);
    } catch (error: any) {
      res.status(404).json({ message: error.message.replace('NOT_FOUND: ', '') });
    }
  };

  updateBrand = async (req: Request, res: Response): Promise<void> => {
    try {
      const brand = await this.service.updateBrand(req.params["id"] as string, req.body);
      res.status(200).json(brand);
    } catch (error: any) {
      if (error.message.includes('NOT_FOUND')) {
        res.status(404).json({ message: error.message.replace('NOT_FOUND: ', '') });
      } else {
        res.status(400).json({ message: error.message.replace('BAD_REQUEST: ', '') });
      }
    }
  };

  deleteBrand = async (req: Request, res: Response): Promise<void> => {
    try {
      await this.service.deleteBrand(req.params["id"] as string);
      res.status(204).send(); 
    } catch (error: any) {
      res.status(404).json({ message: error.message.replace('NOT_FOUND: ', '') });
    }
  };
}