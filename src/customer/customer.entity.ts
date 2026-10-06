export interface Customer {
  id: string;
  user_id: string | null; // null para los clientes de local (sin cuenta web)
  name: string;
  government_id: string | null;
  tax_status: string; // consumidor_final | responsable_inscripto | monotributo | exento
  phone: string | null;
  address: string | null;
  created_at: string;
}

// Customer con el email de su cuenta web (para el listado del panel).
export interface CustomerWithEmail extends Customer {
  email: string | null; // null si el cliente no tiene cuenta web
}
