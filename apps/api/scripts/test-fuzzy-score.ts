import { NormalizerService } from '../src/matching/normalizer.service';
import { FuzzyMatcherService } from '../src/matching/fuzzy-matcher.service';

const normalizer = new NormalizerService();
const fuzzy = new FuzzyMatcherService();

const pairs: Array<[string, string, string]> = [
  ['Oppo A6 - 8GB RAM - 256GB - Aurora Gold', 'OPPO A6 Smartphone, 256 GB, Aurora Gold, Dual SIM, 8 GB RAM, 5G', 'SAME product, diff wording'],
  ['Oppo A6 - 8GB RAM - 256GB - Aurora Gold', 'Oppo A6 - 8GB RAM - 256GB - Sapphire Blue', 'SAME model, DIFFERENT color'],
  ['Oppo A6 - 8GB RAM - 256GB - Aurora Gold', 'Oppo Reno14 Smartphone, 512 GB, Forest Green, Dual SIM, 12 GB RAM, 5G', 'DIFFERENT model'],
];

for (const [a, b, label] of pairs) {
  const na = normalizer.normalizeTitle(a);
  const nb = normalizer.normalizeTitle(b);
  const score = fuzzy.combinedScore(na.normalized, na.tokens, nb.normalized, nb.tokens);
  console.log(`${score.toFixed(4)}  ${label}`);
}
