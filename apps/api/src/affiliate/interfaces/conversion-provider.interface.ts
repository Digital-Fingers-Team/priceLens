export type ConversionStatus = 'PENDING' | 'APPROVED' | 'REVERSED';

/** A sale/action as reported by an affiliate network, before it's matched to an AffiliateClick row. */
export interface RawConversion {
  externalActionId: string;
  /** The sub-id/click-id the network's report carries back -- must equal an AffiliateClick.id to reconcile. */
  clickId: string;
  status: ConversionStatus;
  saleAmount: number | null;
  commissionAmount: number | null;
  currency: string;
  occurredAt: Date;
}

/**
 * Strategy interface for one affiliate network's conversion reporting.
 * Both capabilities are optional since not every network offers both --
 * implement whichever your program's network actually supports. Adding a
 * new network never requires touching ConversionReconciliationService or
 * ConversionProviderRegistry, only a new class registered in AffiliateModule
 * (see CONVERSION_PROVIDERS), mirroring how AffiliateProvider is extended.
 */
export interface ConversionProvider {
  readonly networkKey: string;

  /** Pull conversions recorded since a given time (used by the scheduled poll job). */
  fetchConversions?(since: Date): Promise<RawConversion[]>;

  /** Parse one inbound webhook/postback call's params into a RawConversion, or null if unparseable. */
  parseWebhookPayload?(payload: Record<string, unknown>): RawConversion | null;
}
