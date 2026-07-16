import { NormalizerService } from '../src/matching/normalizer.service';
import { FuzzyMatcherService } from '../src/matching/fuzzy-matcher.service';

const normalizer = new NormalizerService();
const fuzzy = new FuzzyMatcherService();

const pairs: [string, string, string][] = [
  ['AMD Ryzen 7 7700 8-Core, 16-Thread Unlocked Desktop Processor', 'AMD Ryzen 7 7700X 8-Core, 16-Thread Unlocked Desktop Processor', 'AMD (guard should reject before scoring)'],
  ['SAMSUNG 32-Inch Class Full HD F6000 Smart TV (2025 Model) HDR, Object Tracking Sound Lite, Knox Security, One UI Tizen, Smart TV', 'Samsung 32-Inch Class HD H5000F Smart TV (2025 Model) HDR, Object Tracking Sound Lite, Knox Security, One UI Tizen', 'Samsung F6000/H5000F (should stay LLM-gated, low/mid score ideally)'],
  ['Oppo A6 - 8GB RAM - 256GB - Aurora Gold', 'OPPO A6 Smartphone, 256 GB, Aurora Gold, Dual SIM, 8 GB RAM, 5G', 'Oppo A6 real dup'],
  ['RENO 15 12GB /512GB 5G -TWILIGHT BLUE', 'OPPO Reno15 5G - 12GB RAM - 512GB - Twilight Blue', 'Reno15 real dup'],
  ['Sony WH-1000XM5 Premium Noise Canceling Headphones, Auto NC Optimizer, 30-Hour Battery, Alexa Voice Control, Black | Auto Nc Optimizer, Up to 30-Hour Battery, Alexa and Google Voice Control, Ldac Bluetooth 5.2', 'Sony WH-1000XM5 Premium Noise Canceling Headphones, Auto NC Optimizer, 30-Hour Battery, Alexa Voice Control, Black', 'Sony real dup'],
  ['Oppo A6 - 8GB RAM - 256GB - Aurora Gold', 'Oppo A6 - 8GB RAM - 256GB - Sapphire Blue', 'Oppo different color (should reject)'],
];

for (const [a, b, label] of pairs) {
  const na = normalizer.normalizeTitle(a);
  const nb = normalizer.normalizeTitle(b);
  const score = fuzzy.combinedScore(na.normalized, na.tokens, nb.normalized, nb.tokens);
  const extractedA = normalizer.extractAttributes(a);
  const extractedB = normalizer.extractAttributes(b);
  console.log(`score=${score.toFixed(3)}  brandA=${extractedA.brand} brandB=${extractedB.brand}  modelA=${extractedA.model} modelB=${extractedB.model}  -- ${label}`);
}
