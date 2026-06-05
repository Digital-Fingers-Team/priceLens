import type { ProductModelDefinition } from '../types';

export const cpuModels: ProductModelDefinition[] = [
  {
    categorySlug: 'processors',
    brand: 'AMD',
    series: 'Ryzen',
    models: ['Ryzen 5 5600X', 'Ryzen 7 5800X3D', 'Ryzen 5 7600X', 'Ryzen 7 7800X3D', 'Ryzen 9 7900X', 'Ryzen 9 7950X', 'Ryzen 7 9800X3D'],
    variants: ['Boxed', 'Tray', 'Wraith Cooler', 'No Cooler'],
    editions: ['AM4', 'AM5', 'Unlocked'],
    basePrice: 179,
    releaseYears: [2021, 2022, 2023, 2024, 2025],
  },
  {
    categorySlug: 'processors',
    brand: 'Intel',
    series: 'Core',
    models: ['Core i5-12600K', 'Core i7-12700K', 'Core i9-12900K', 'Core i5-13600K', 'Core i7-13700K', 'Core i9-13900K', 'Core Ultra 7 265K'],
    variants: ['Boxed', 'Tray', 'K', 'KF'],
    editions: ['LGA1700', 'LGA1851', 'Unlocked'],
    basePrice: 199,
    releaseYears: [2021, 2022, 2023, 2024, 2025],
  },
];
