import type { ProductModelDefinition } from '../types';

export const gpuModels: ProductModelDefinition[] = [
  {
    categorySlug: 'graphics-cards',
    brand: 'NVIDIA',
    series: 'GeForce RTX',
    models: ['RTX 3060', 'RTX 3070', 'RTX 3080', 'RTX 4070', 'RTX 4080', 'RTX 4090', 'RTX 5070', 'RTX 5080'],
    variants: ['Standard', 'Ti', 'Super', 'Founders Edition'],
    ram: ['8GB', '10GB', '12GB', '16GB', '24GB'],
    editions: ['Dual Fan', 'Triple Fan', 'OC Edition', 'Gaming OC', 'Founders Edition'],
    basePrice: 329,
    releaseYears: [2021, 2022, 2023, 2024, 2025],
    searchBoost: 1.2,
  },
  {
    categorySlug: 'graphics-cards',
    brand: 'AMD',
    series: 'Radeon RX',
    models: ['RX 6600', 'RX 6700', 'RX 6800', 'RX 7600', 'RX 7700', 'RX 7800', 'RX 7900'],
    variants: ['Standard', 'XT', 'XTX', 'GRE'],
    ram: ['8GB', '12GB', '16GB', '20GB', '24GB'],
    editions: ['Reference', 'Pulse', 'Nitro+', 'Red Devil', 'Gaming OC'],
    basePrice: 269,
    releaseYears: [2021, 2022, 2023, 2024, 2025],
  },
  {
    categorySlug: 'graphics-cards',
    brand: 'Intel',
    series: 'Arc',
    models: ['Arc A380', 'Arc A580', 'Arc A750', 'Arc A770', 'Arc B580'],
    variants: ['Standard', 'Limited Edition', 'OC'],
    ram: ['6GB', '8GB', '12GB', '16GB'],
    editions: ['Dual Fan', 'Limited Edition', 'OC Edition'],
    basePrice: 149,
    releaseYears: [2022, 2023, 2024, 2025],
  },
];
