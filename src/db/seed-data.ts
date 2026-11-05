// Datos de ejemplo para `npm run seed`. Se editan aca sin tocar la logica del seed.
// Las contraseñas son de desarrollo: no usar este seed en produccion.

export const SEED_PASSWORD = "tiendabox123";

export const SEED_OWNERS = [{ email: "dueno@tiendabox.com", password: SEED_PASSWORD }];

// Cada cliente se crea junto con su cuenta web (email + password).
export const SEED_CUSTOMERS = [
  {
    email: "juan.perez@example.com",
    name: "Juan Pérez",
    government_id: "30123456",
    tax_status: "consumidor_final",
    phone: "1155550101",
    address: "Av. Corrientes 1234, CABA",
  },
  {
    email: "maria.gomez@example.com",
    name: "María Gómez",
    government_id: "28765432",
    tax_status: "consumidor_final",
    phone: "1155550102",
    address: "San Martín 456, Rosario",
  },
  {
    email: "luis.fernandez@example.com",
    name: "Luis Fernández",
    government_id: "20301234567",
    tax_status: "monotributo",
    phone: "1155550103",
    address: "Belgrano 789, Córdoba",
  },
  {
    email: "ana.lopez@example.com",
    name: "Ana López",
    government_id: "27112233445",
    tax_status: "responsable_inscripto",
    phone: "1155550104",
    address: "Mitre 321, Mendoza",
  },
];

export const SEED_CATEGORIES = [
  { name: "Notebooks", description: "Computadoras portátiles" },
  { name: "Celulares", description: "Teléfonos inteligentes" },
  { name: "Accesorios", description: "Periféricos y complementos" },
];

// Imagen de relleno con el texto dado (placehold.co devuelve un PNG generado al vuelo).
const placeholder = (text: string): string =>
  `https://placehold.co/600x400/png?text=${encodeURIComponent(text)}`;

// Logos desde Simple Icons; Logitech no esta en ese catalogo, asi que usa un placeholder.
export const SEED_BRANDS = [
  { name: "Lenovo", logo_url: "https://cdn.simpleicons.org/lenovo" },
  { name: "Samsung", logo_url: "https://cdn.simpleicons.org/samsung" },
  { name: "Logitech", logo_url: placeholder("Logitech") },
  { name: "Apple", logo_url: "https://cdn.simpleicons.org/apple" },
];

// category y brand se referencian por nombre; el seed los resuelve a ids.
// Los productos "encargo" no llevan price ni stock (los fija el servicio).
export const SEED_PRODUCTS = [
  {
    name: "Notebook Lenovo IdeaPad 15",
    description: "15.6 pulgadas, 16 GB RAM, SSD 512 GB",
    image_url:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRhSIyzrNj1kvWfWX7XayfzPDzWyTsGuN4Hytcn3Idcfg&s=10",
    type: "stock",
    price: 850000,
    stock: 8,
    category: "Notebooks",
    brand: "Lenovo",
  },
  {
    name: "Notebook Lenovo ThinkPad X1",
    description: "14 pulgadas, 32 GB RAM, SSD 1 TB",
    image_url:
      "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRhSIyzrNj1kvWfWX7XayfzPDzWyTsGuN4Hytcn3Idcfg&s=10",
    type: "encargo",
    category: "Notebooks",
    brand: "Lenovo",
  },
  {
    name: "MacBook Air M3",
    description: "13 pulgadas, 16 GB RAM, SSD 512 GB",
    image_url:
      "https://encrypted-tbn2.gstatic.com/shopping?q=tbn:ANd9GcTItP6aacq_Ykw38D38IiVuK249X35F8J3K6jA8YvApV-bp0s_RaBhOgyOiEwyI6UWYmue7n8xt7lpuB5TULTvHC3ZnQyXMRO8ROeZOZazLp6xJLpnq6OLo8Q",
    type: "encargo",
    category: "Notebooks",
    brand: "Apple",
  },
  {
    name: "Samsung Galaxy S24",
    description: "128 GB, pantalla AMOLED 6.2 pulgadas",
    image_url:
      "https://images.samsung.com/is/image/samsung/p6pim/ar/2401/gallery/ar-galaxy-s24-sm-s921bzvmaro-539290645?$Q90_684_547_JPG$",
    type: "stock",
    price: 1200000,
    stock: 12,
    category: "Celulares",
    brand: "Samsung",
  },
  {
    name: "Samsung Galaxy A55",
    description: "256 GB, cámara triple de 50 MP",
    image_url: placeholder("Samsung Galaxy A55"),
    type: "stock",
    price: 520000,
    stock: 20,
    category: "Celulares",
    brand: "Samsung",
  },
  {
    name: "iPhone 15 Pro",
    description: "256 GB, chip A17 Pro",
    image_url: placeholder("iPhone 15 Pro"),
    type: "encargo",
    category: "Celulares",
    brand: "Apple",
  },
  {
    name: "Mouse Logitech MX Master 3S",
    description: "Mouse inalámbrico ergonómico",
    image_url: placeholder("Mouse Logitech MX Master 3S"),
    type: "stock",
    price: 130000,
    stock: 25,
    category: "Accesorios",
    brand: "Logitech",
  },
  {
    name: "Teclado Logitech K380",
    description: "Teclado Bluetooth multidispositivo",
    image_url: placeholder("Teclado Logitech K380"),
    type: "stock",
    price: 60000,
    stock: 30,
    category: "Accesorios",
    brand: "Logitech",
  },
  {
    name: "Webcam Logitech C920",
    description: "Full HD 1080p con micrófono",
    image_url: placeholder("Webcam Logitech C920"),
    type: "stock",
    price: 95000,
    stock: 15,
    category: "Accesorios",
    brand: "Logitech",
  },
  {
    name: "Auriculares Samsung Galaxy Buds2",
    description: "Bluetooth con cancelación de ruido",
    image_url: placeholder("Auriculares Samsung Galaxy Buds2"),
    type: "stock",
    price: 110000,
    stock: 18,
    category: "Accesorios",
    brand: "Samsung",
  },
];
