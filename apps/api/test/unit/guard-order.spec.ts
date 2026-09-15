import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '../../src/auth/auth.module';
import { JwtAuthGuard } from '../../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../../src/common/guards/roles.guard';
import { FeatureGuard } from '../../src/billing/feature.guard';

/**
 * Global guards run in registration order, and both RolesGuard and
 * FeatureGuard depend on request.user, which only JwtAuthGuard populates.
 *
 * This was a live defect: FeatureGuard was registered in AppModule, ran first,
 * saw no user, and answered 401 "sign in" to users who were already signed in.
 * Asserting the order here is cheap and catches a reordering that would
 * otherwise only show up as a confusing 401 in production.
 */
describe('global guard registration order', () => {
  it('registers JwtAuthGuard before the guards that read request.user', () => {
    const providers = Reflect.getMetadata('providers', AuthModule) as Array<{
      provide?: unknown;
      useClass?: unknown;
    }>;

    const guardOrder = providers
      .filter((provider) => provider?.provide === APP_GUARD)
      .map((provider) => provider.useClass);

    const jwtIndex = guardOrder.indexOf(JwtAuthGuard);
    const rolesIndex = guardOrder.indexOf(RolesGuard);
    const featureIndex = guardOrder.indexOf(FeatureGuard);

    expect(jwtIndex).toBeGreaterThanOrEqual(0);
    expect(rolesIndex).toBeGreaterThan(jwtIndex);
    expect(featureIndex).toBeGreaterThan(jwtIndex);
  });
});
