'use client';
import { create } from 'zustand';
import type { SearchFilters } from '@/types/search.types';

interface SearchState {
  filters: SearchFilters;
  isFilterPanelOpen: boolean;
  setFilter: <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => void;
  setFilters: (filters: Partial<SearchFilters>) => void;
  resetFilters: () => void;
  toggleFilterPanel: () => void;
}

const DEFAULT_FILTERS: SearchFilters = {
  q: '',
  page: 1,
  limit: 20,
  sortBy: 'relevance',
  sortDir: 'desc',
};

export const useSearchStore = create<SearchState>((set) => ({
  filters: DEFAULT_FILTERS,
  isFilterPanelOpen: false,

  setFilter: (key, value) =>
    set((state) => ({
      filters: { ...state.filters, [key]: value, page: key !== 'page' ? 1 : state.filters.page },
    })),

  setFilters: (filters) =>
    set((state) => ({
      filters: { ...state.filters, ...filters, page: 1 },
    })),

  resetFilters: () => set({ filters: DEFAULT_FILTERS }),

  toggleFilterPanel: () =>
    set((state) => ({ isFilterPanelOpen: !state.isFilterPanelOpen })),
}));