import type { ProductModelDefinition } from '../types';

export const monitorModels: ProductModelDefinition[] = [
  {
    categorySlug: 'monitors',
    brand: 'LG',
    series: 'UltraGear',
    models: ['UltraGear 27GP850', 'UltraGear 32GQ950', 'UltraGear 45GR95QE', 'UltraWide 34GN850'],
    displaySizes: ['24 inch', '27 inch', '32 inch', '34 inch', '45 inch'],
    refreshRates: ['75Hz', '144Hz', '165Hz', '240Hz'],
    editions: ['QHD', '4K UHD', 'OLED', 'Curved'],
    basePrice: 249,
    releaseYears: [2021, 2022, 2023, 2024, 2025],
  },
  {
    categorySlug: 'monitors',
    brand: 'Samsung',
    series: 'Odyssey',
    models: ['Odyssey G5', 'Odyssey G7', 'Odyssey G8', 'Odyssey Neo G9'],
    displaySizes: ['27 inch', '32 inch', '34 inch', '49 inch'],
    refreshRates: ['144Hz', '165Hz', '240Hz'],
    editions: ['QHD', '4K UHD', 'Mini LED', 'Curved'],
    basePrice: 279,
    releaseYears: [2021, 2022, 2023, 2024, 2025],
  },
  {
    categorySlug: 'monitors',
    brand: 'Dell',
    series: 'Dell',
    models: ['UltraSharp U2723QE', 'Alienware AW3423DWF', 'S2722QC', 'G2724D'],
    displaySizes: ['24 inch', '27 inch', '32 inch', '34 inch'],
    refreshRates: ['60Hz', '120Hz', '144Hz', '165Hz'],
    editions: ['USB-C', 'OLED', 'QHD', '4K UHD'],
    basePrice: 199,
    releaseYears: [2021, 2022, 2023, 2024, 2025],
  },
];
