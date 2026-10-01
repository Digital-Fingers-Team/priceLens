import { Global, Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { FeatureFlagsController } from './feature-flags.controller';
import { FeatureFlagsService } from './feature-flags.service';

/** Global for the same reason as BillingModule: FeatureGuard and every gated module read it. */
@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [FeatureFlagsController],
  providers: [FeatureFlagsService],
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {}
