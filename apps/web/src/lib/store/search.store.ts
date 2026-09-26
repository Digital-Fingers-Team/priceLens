'use client';
import { create } from 'zustand';

/**
 * UI-only state for the search page. The filters themselves live in the URL
 * (lib/search-url.ts), which is what makes back/forward and shared links work.
 */
interface SearchState {
  isFilterPanelOpen: boolean;
  toggleFilterPanel: () => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  isFilterPanelOpen: false,
  toggleFilterPanel: () =>
    set((state) => ({ isFilterPanelOpen: !state.isFilterPanelOpen })),
}));
