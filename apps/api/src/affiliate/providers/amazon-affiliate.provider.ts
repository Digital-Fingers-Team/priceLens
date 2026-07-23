import { Injectable } from '@nestjs/common';
import { AffiliateLinkContext } from '../interfaces';
import { BaseAffiliateProvider } from './base-affiliate.provider';

/**
 * Amazon Associates convention: the partner tag goes in `tag`, and a
 * secondary free-form sub-id (used here for our own click id, so a
 * conversion report from Amazon can be matched back to an AffiliateClick
 * row) goes in `ascsubtag`.
 */
@Injectable()
export class AmazonAffiliateProvider extends BaseAffiliateProvider {
  readonly storeKey = 'amazon';

  protected buildQueryParams(context: AffiliateLinkContext): Record<string, string> {
    return {
      tag: context.affiliateId,
      ascsubtag: context.clickId,
    };
  }
}
