export interface Customer {
  id: string;
  user_id: string;
  name: string;
  government_id: string | null;
  tax_status: string; // consumidor_final | responsable_inscripto | monotributo | exento
  phone: string | null;
  address: string | null;
  created_at: string;
}
