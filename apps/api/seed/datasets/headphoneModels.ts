import type { ProductModelDefinition } from '../types';

export const headphoneModels: ProductModelDefinition[] = [
  {
    categorySlug: 'headphones',
    brand: 'Apple',
    series: 'AirPods',
    models: ['AirPods 3', 'AirPods 4', 'AirPods Pro 2', 'AirPods Max'],
    variants: ['Lightning Case', 'USB-C Case', 'Wireless Charging', 'ANC'],
    colors: ['White', 'Silver', 'Space Gray', 'Blue', 'Pink'],
    editions: ['Standard', 'MagSafe Case', 'Limited Edition'],
    basePrice: 129,
    releaseYears: [2021, 2022, 2023, 2024, 2025],
  },
  {
    categorySlug: 'headphones',
    brand: 'Sony',
    series: 'Sony Headphones',
    models: ['WH-1000XM4', 'WH-1000XM5', 'WF-1000XM5', 'ULT Wear'],
    variants: ['Over-Ear', 'Earbuds', 'Noise Cancelling'],
    colors: ['Black', 'Silver', 'Blue'],
    editions: ['Standard', 'Travel Bundle'],
    basePrice: 179,
    releaseYears: [2021, 2022, 2023, 2024, 2025],
  },
  {
    categorySlug: 'headphones',
    brand: 'Bose',
    series: 'Bose',
    models: ['QuietComfort', 'QuietComfort Ultra', 'Ultra Open Earbuds', '700'],
    variants: ['Over-Ear', 'Earbuds', 'ANC'],
    colors: ['Black', 'White Smoke', 'Sandstone', 'Lunar Blue'],
    editions: ['Standard', 'Charging Case', 'Travel Bundle'],
    basePrice: 149,
    releaseYears: [2021, 2022, 2023, 2024, 2025],
  },
];
