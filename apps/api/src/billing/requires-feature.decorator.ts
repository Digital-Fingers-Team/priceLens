import { SetMetadata } from '@nestjs/common';
import { FeatureKey } from './plan-limits';

export const REQUIRES_FEATURE_KEY = 'requires_feature';

/**
 * Gate a route on a plan feature.
 *
 * Enforced by FeatureGuard, which is registered globally -- so a route is
 * ungated unless it opts in, and opting in cannot be forgotten at the module
 * level the way a manually-applied guard can.
 */
export const RequiresFeature = (...features: FeatureKey[]) => SetMetadata(REQUIRES_FEATURE_KEY, features);
