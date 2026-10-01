import { SetMetadata } from '@nestjs/common';
import type { FlagKey } from './feature-flags.registry';

export const REQUIRES_FLAG_KEY = 'requires_flag';

/**
 * Gate a route on an operational switch no plan sells (a payment provider,
 * invites). Plan features need only @RequiresFeature: FeatureGuard checks
 * their flag too.
 */
export const RequiresFlag = (...flags: FlagKey[]) => SetMetadata(REQUIRES_FLAG_KEY, flags);
