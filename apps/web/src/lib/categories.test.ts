import { describe, expect, it } from 'vitest';
import type { Dictionary } from '@/lib/i18n/dictionaries';
import type { CategoryOption } from '@/types/search.types';
import { categoryName, groupCategories, localizedCategories } from './categories';

const t = {
  categories: { smartphones: 'هواتف ذكية', electronics: 'إلكترونيات' },
  seo: { otherCategories: 'أخرى' },
} as unknown as Dictionary;

const option = (over: Partial<CategoryOption>): CategoryOption => ({
  id: over.slug ?? 'x',
  slug: 'x',
  name: 'X',
  nameAr: null,
  parentId: 'g',
  level: 1,
  productCount: 1,
  groupSlug: null,
  groupName: null,
  groupNameAr: null,
  ...over,
});

const phones = option({ slug: 'smartphones', name: 'Smartphones', productCount: 50, groupSlug: 'electronics', groupName: 'Electronics', groupNameAr: 'إلكترونيات' });
const fridges = option({ slug: 'refrigerators', name: 'Refrigerators', nameAr: 'ثلاجات', productCount: 30, groupSlug: 'large-appliances', groupName: 'Large Appliances', groupNameAr: 'أجهزة منزلية كبيرة' });
const washers = option({ slug: 'washing-machines', name: 'Washing Machines', nameAr: 'غسالات ملابس', productCount: 40, groupSlug: 'large-appliances', groupName: 'Large Appliances', groupNameAr: 'أجهزة منزلية كبيرة' });
const orphan = option({ slug: 'misc', name: 'Misc', productCount: 1 });

describe('categoryName', () => {
  it('prefers the dictionary, then the Arabic name in Arabic, then the API name', () => {
    expect(categoryName(t, phones, 'ar')).toBe('هواتف ذكية');
    expect(categoryName(t, fridges, 'ar')).toBe('ثلاجات');
    expect(categoryName(t, fridges, 'en')).toBe('Refrigerators');
    expect(categoryName(t, orphan, 'ar')).toBe('Misc');
  });
});

describe('localizedCategories', () => {
  it('uses Arabic names from the API for the Arabic page', () => {
    expect(localizedCategories(t, [fridges], 'ar').map((c) => c.name)).toEqual(['ثلاجات']);
  });
});

describe('groupCategories', () => {
  it('groups leaves by department, electronics first, then by product count', () => {
    const groups = groupCategories(t, [fridges, phones, washers, orphan], 'en');
    expect(groups.map((g) => g.slug)).toEqual(['electronics', 'large-appliances', 'other']);
    expect(groups[1].categories.map((c) => c.slug)).toEqual(['refrigerators', 'washing-machines']);
  });

  it('names groups in the page language and puts ungrouped leaves under "other"', () => {
    const groups = groupCategories(t, [fridges, orphan], 'ar');
    expect(groups.map((g) => g.name)).toEqual(['أجهزة منزلية كبيرة', 'أخرى']);
  });
});
