import type { NotificationChannelType } from './billing.types';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  url: string | null;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPage {
  items: AppNotification[];
  nextCursor: string | null;
}

export interface NotificationChannel {
  id: string;
  type: NotificationChannelType;
  /** Masked by the API — never the full address. */
  destination: string | null;
  isActive: boolean;
  verified: boolean;
  allowedByPlan: boolean;
  failureCount: number;
  lastUsedAt: string | null;
}

export interface ChannelAvailability {
  configured: boolean;
  allowed: boolean;
}

export interface NotificationChannelsResponse {
  channels: NotificationChannel[];
  available: Record<NotificationChannelType, ChannelAvailability>;
}
