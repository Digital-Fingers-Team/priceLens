import { Injectable } from '@nestjs/common';
import { AffiliateLinkContext, AffiliateProvider } from '../interfaces';

/**
 * AliExpress Portals deep link: the click goes through s.click.aliexpress.com
 * with the publisher's short key in `aff_short_key` and the product in
 * `dl_target_url`, and AliExpress answers with a 302 to the product carrying
 * fresh `aff_fcid`/`aff_trace_key` params. The short key is the `_xxxx` part
 * of any link the Portals link generator makes (checked 2026-10-10).
 *
 * A scraped product URL carries search-session params (algo_pvid, pdp_npi,
 * ...), so only its origin and path are passed on. Products outside the
 * affiliate program still open, they just earn nothing.
 */
@Injectable()
export class AliexpressAffiliateProvider implements AffiliateProvider {
  readonly storeKey = 'aliexpress';

  private static readonly DEEP_LINK_URL = 'https://s.click.aliexpress.com/deep_link.htm';

  buildAffiliateUrl(context: AffiliateLinkContext): string {
    const product = new URL(context.externalUrl);
    const redirect = new URL(AliexpressAffiliateProvider.DEEP_LINK_URL);
    const params = {
      ...context.trackingParams,
      aff_short_key: context.affiliateId,
      dl_target_url: product.origin + product.pathname,
    };
    for (const [key, value] of Object.entries(params)) {
      redirect.searchParams.set(key, value);
    }
    return redirect.toString();
  }
}
