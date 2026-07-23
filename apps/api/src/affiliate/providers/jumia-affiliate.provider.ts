import { Injectable } from '@nestjs/common';
import { AffiliateLinkContext, AffiliateProvider } from '../interfaces';

/**
 * Jumia's affiliate network (unlike Amazon/Noon) doesn't accept a tag on the
 * retailer's own URL -- clicks must go through the network's redirector
 * domain, which wraps the real destination in a `url` param. Implements
 * AffiliateProvider directly (not BaseAffiliateProvider) since "append
 * params to the existing URL" doesn't apply here at all -- this is exactly
 * the kind of divergent per-store logic the provider interface exists to
 * isolate.
 */
@Injectable()
export class JumiaAffiliateProvider implements AffiliateProvider {
  readonly storeKey = 'jumia';

  private static readonly NETWORK_REDIRECT_URL = 'https://c.jumia.io/deeplink';

  buildAffiliateUrl(context: AffiliateLinkContext): string {
    const redirect = new URL(JumiaAffiliateProvider.NETWORK_REDIRECT_URL);
    const params = {
      ...context.trackingParams,
      adid: context.affiliateId,
      subid: context.clickId,
      url: context.externalUrl,
    };
    for (const [key, value] of Object.entries(params)) {
      redirect.searchParams.set(key, value);
    }
    return redirect.toString();
  }
}
