import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SemanticService } from '../src/matching/semantic.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const semantic = app.get(SemanticService);

  const pairs: [string, string, string][] = [
    ['AMD Ryzen 7 7700 8-Core, 16-Thread Unlocked Desktop Processor', 'AMD Ryzen 7 7700X 8-Core, 16-Thread Unlocked Desktop Processor', 'should be FALSE (different SKU)'],
    ['SAMSUNG 32-Inch Class Full HD F6000 Smart TV (2025 Model) HDR, Object Tracking Sound Lite, Knox Security, One UI Tizen, Smart TV', 'Samsung 32-Inch Class HD H5000F Smart TV (2025 Model) HDR, Object Tracking Sound Lite, Knox Security, One UI Tizen', 'should be FALSE (different model)'],
    ['Oppo A6 - 8GB RAM - 256GB - Aurora Gold', 'OPPO A6 Smartphone, 256 GB, Aurora Gold, Dual SIM, 8 GB RAM, 5G', 'should be TRUE (real duplicate)'],
    ['RENO 15 12GB /512GB 5G -TWILIGHT BLUE', 'OPPO Reno15 5G - 12GB RAM - 512GB - Twilight Blue', 'should be TRUE (real duplicate)'],
    ['Sony WH-1000XM5 Premium Noise Canceling Headphones, Auto NC Optimizer, 30-Hour Battery, Alexa Voice Control, Black | Auto Nc Optimizer, Up to 30-Hour Battery, Alexa and Google Voice Control, Ldac Bluetooth 5.2', 'Sony WH-1000XM5 Premium Noise Canceling Headphones, Auto NC Optimizer, 30-Hour Battery, Alexa Voice Control, Black', 'should be TRUE (real duplicate)'],
    ['Oppo A6 - 8GB RAM - 256GB - Aurora Gold', 'Oppo A6 - 8GB RAM - 256GB - Sapphire Blue', 'should be FALSE (different color)'],
  ];

  for (const [a, b, expectation] of pairs) {
    const verdict = await semantic.judgeSameProduct(a, b);
    console.log(`verdict=${verdict}  (${expectation})`);
  }

  await app.close();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
