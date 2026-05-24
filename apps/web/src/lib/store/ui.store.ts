'use client';
import { create } from 'zustand';

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface UiState {
  toasts: ToastItem[];
  alertProductId: string | null;
  addToast: (message: string, variant?: ToastVariant) => string;
  removeToast: (id: string) => void;
  openAlertModal: (productId: string) => void;
  closeAlertModal: () => void;
}

const MAX_TOASTS = 4;
let toastCounter = 0;

export const useUiStore = create<UiState>((set) => ({
  toasts: [],
  alertProductId: null,

  addToast: (message, variant = 'info') => {
    const id = `toast-${++toastCounter}`;

    set((state) => ({
      toasts: [...state.toasts, { id, message, variant }].slice(-MAX_TOASTS),
    }));

    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((toast) => toast.id !== id),
      }));
    }, 4000);

    return id;
  },

  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    })),

  openAlertModal: (productId) => set({ alertProductId: productId }),

  closeAlertModal: () => set({ alertProductId: null }),
}));
