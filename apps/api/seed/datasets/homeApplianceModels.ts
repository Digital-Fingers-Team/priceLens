import type { ProductModelDefinition } from '../types';

export const homeApplianceModels: ProductModelDefinition[] = [
  {
    categorySlug: 'home-appliances',
    brand: 'Samsung',
    series: 'Samsung Appliance',
    models: ['Bespoke Refrigerator', 'Front Load Washer', 'Jet Bot Vacuum', 'Bespoke Microwave'],
    capacities: ['18 cu ft', '22 cu ft', '5.3 cu ft', '1.9 cu ft'],
    colors: ['White', 'Black Stainless', 'Silver', 'Navy Glass'],
    energyRatings: ['Energy Star', 'A++', 'A+++'],
    editions: ['Wi-Fi', 'SmartThings', 'Inverter'],
    basePrice: 299,
    releaseYears: [2021, 2022, 2023, 2024, 2025],
  },
  {
    categorySlug: 'home-appliances',
    brand: 'LG',
    series: 'LG Appliance',
    models: ['InstaView Refrigerator', 'WashTower', 'CordZero Vacuum', 'Dual Inverter AC'],
    capacities: ['18 cu ft', '26 cu ft', '4.5 cu ft', '12000 BTU', '18000 BTU'],
    colors: ['White', 'Black Steel', 'Platinum Silver'],
    energyRatings: ['Energy Star', 'A++', 'A+++'],
    editions: ['ThinQ', 'Inverter', 'Steam'],
    basePrice: 349,
    releaseYears: [2021, 2022, 2023, 2024, 2025],
  },
  {
    categorySlug: 'home-appliances',
    brand: 'Dyson',
    series: 'Dyson',
    models: ['V12 Detect Slim', 'V15 Detect', 'Airwrap', 'Supersonic', 'Pure Cool'],
    variants: ['Standard', 'Complete', 'Absolute'],
    colors: ['Nickel', 'Blue', 'Prussian Blue', 'Copper'],
    editions: ['HEPA', 'Gift Edition', 'Professional'],
    basePrice: 299,
    releaseYears: [2021, 2022, 2023, 2024, 2025],
  },
];
