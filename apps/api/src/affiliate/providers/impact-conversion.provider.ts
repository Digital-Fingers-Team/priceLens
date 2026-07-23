import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConversionProvider, ConversionStatus, RawConversion } from '../interfaces';

interface ImpactAction {
  Id: string;
  Sid: string | null;
  State: string;
  Payout: string | number | null;
  Amount: string | number | null;
  Currency: string | null;
  EventDate: string;
}

interface ImpactActionsResponse {
  Actions: ImpactAction[];
}

/**
 * impact.com Advertiser Actions API. Auth is HTTP Basic with the account SID
 * as username and the auth token as password -- Impact's standard,
 * long-stable convention for this endpoint.
 *
 * `Sid` on each Action is whatever sub-tracking value was attached to the
 * original click. For this to ever line up with an AffiliateClick.id, the
 * *outbound* link for any store whose real affiliate program runs through
 * Impact needs to actually route through Impact's own tracking domain with
 * our click id passed as its sub-id -- linking straight to the retailer with
 * our own custom query param (as AmazonAffiliateProvider etc do) never
 * reaches Impact's tracking at all, so Impact would have nothing to report.
 * That's a per-store AffiliateProvider concern to revisit once you know
 * which stores' programs actually run through Impact -- this provider only
 * owns pulling/parsing whatever Impact reports.
 *
 * Field names reflect Impact's public API docs as of this writing --
 * Impact versions endpoints per-advertiser, so re-verify against your
 * account's own API reference/Postman collection once real credentials are
 * in hand.
 */
@Injectable()
export class ImpactConversionProvider implements ConversionProvider {
  readonly networkKey = 'impact';
  private readonly logger = new Logger(ImpactConversionProvider.name);

  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.accountSid = this.config.get<string>('affiliate.impactAccountSid', '');
    this.authToken = this.config.get<string>('affiliate.impactAuthToken', '');
    this.baseUrl = this.config.get<string>('affiliate.impactBaseUrl', 'https://api.impact.com');
  }

  private get isConfigured(): boolean {
    return Boolean(this.accountSid && this.authToken);
  }

  async fetchConversions(since: Date): Promise<RawConversion[]> {
    if (!this.isConfigured) {
      this.logger.warn(
        'Impact API not configured (IMPACT_ACCOUNT_SID / IMPACT_AUTH_TOKEN unset) -- skipping poll',
      );
      return [];
    }

    const url = new URL(`${this.baseUrl}/Advertisers/${this.accountSid}/Actions.json`);
    url.searchParams.set('ActionDateStart', since.toISOString());
    url.searchParams.set('ActionDateEnd', new Date().toISOString());
    url.searchParams.set('PageSize', '1000');

    try {
      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(20_000),
      });

      if (!response.ok) {
        throw new Error(`Impact Actions API HTTP ${response.status}`);
      }

      const data = (await response.json()) as ImpactActionsResponse;
      return (data.Actions ?? [])
        .filter((action) => Boolean(action.Sid))
        .map((action) => this.toRawConversion(action));
    } catch (error) {
      this.logger.warn(`Impact conversion poll failed: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * Impact's Action Tracker postback calls a URL you configure (in Impact's
   * dashboard, per program) with the action's fields as query params --
   * exact param names are whatever you set up in that postback template.
   * Adjust the keys read below to match yours.
   */
  parseWebhookPayload(payload: Record<string, unknown>): RawConversion | null {
    const clickId = this.firstString(payload.Sid, payload.SubId1);
    const externalActionId = this.firstString(payload.ActionId, payload.Id);
    if (!clickId || !externalActionId) return null;

    const eventDate = this.firstString(payload.EventDate);
    return {
      externalActionId,
      clickId,
      status: this.mapState(this.firstString(payload.State) ?? 'PENDING'),
      saleAmount: this.toNumber(payload.Amount),
      commissionAmount: this.toNumber(payload.Payout),
      currency: this.firstString(payload.Currency) ?? 'USD',
      occurredAt: eventDate ? new Date(eventDate) : new Date(),
    };
  }

  private toRawConversion(action: ImpactAction): RawConversion {
    return {
      externalActionId: action.Id,
      clickId: action.Sid as string,
      status: this.mapState(action.State),
      saleAmount: this.toNumber(action.Amount),
      commissionAmount: this.toNumber(action.Payout),
      currency: action.Currency ?? 'USD',
      occurredAt: new Date(action.EventDate),
    };
  }

  private mapState(state: string): ConversionStatus {
    const normalized = state.toUpperCase();
    if (normalized === 'APPROVED' || normalized === 'CLOSED') return 'APPROVED';
    if (normalized === 'REVERSED') return 'REVERSED';
    return 'PENDING';
  }

  private toNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  private firstString(...values: unknown[]): string | undefined {
    for (const value of values) {
      if (typeof value === 'string' && value.length > 0) return value;
      if (typeof value === 'number') return String(value);
    }
    return undefined;
  }
}
