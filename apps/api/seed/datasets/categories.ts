import type { CategoryDefinition } from '../types';
import { categoryTree } from './categoryTree';

/**
 * Every category the seeds know. The curated tree (categoryTree.ts) is the
 * single source; this name is kept for the demo seed and older imports.
 */
export const categories: CategoryDefinition[] = categoryTree;
