import { consoleModels } from './consoleModels';
import { cpuModels } from './cpuModels';
import { gpuModels } from './gpuModels';
import { headphoneModels } from './headphoneModels';
import { homeApplianceModels } from './homeApplianceModels';
import { laptopModels } from './laptopModels';
import { monitorModels } from './monitorModels';
import { smartphoneModels } from './smartphoneModels';
import { smartwatchModels } from './smartwatchModels';
import { tabletModels } from './tabletModels';
import { tvModels } from './tvModels';
import type { ProductModelDefinition } from '../types';

export const productCatalogs: ProductModelDefinition[] = [
  ...smartphoneModels,
  ...laptopModels,
  ...gpuModels,
  ...cpuModels,
  ...monitorModels,
  ...tvModels,
  ...headphoneModels,
  ...tabletModels,
  ...smartwatchModels,
  ...consoleModels,
  ...homeApplianceModels,
];
