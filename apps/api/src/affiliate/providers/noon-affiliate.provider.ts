import { Injectable } from '@nestjs/common';
import { AffiliateLinkContext } from '../interfaces';
import { BaseAffiliateProvider } from './base-affiliate.provider';

/**
 * Noon's partner program is UTM-flavored rather than a single `tag` field:
 * `partner` carries the affiliate id, `click_id` carries our click id, and
 * standard utm_* params are added so Noon's own analytics attribute the
 * visit to PriceLens too.
 */
@Injectable()
export class NoonAffiliateProvider extends BaseAffiliateProvider {
  readonly storeKey = 'noon';

  protected buildQueryParams(context: AffiliateLinkContext): Record<string, string> {
    return {
      partner: context.affiliateId,
      click_id: context.clickId,
      utm_source: 'pricelens',
      utm_medium: 'affiliate',
    };
  }
}
