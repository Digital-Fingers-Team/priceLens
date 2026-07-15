import { NormalizerService } from '../src/matching/normalizer.service';
import { FuzzyMatcherService } from '../src/matching/fuzzy-matcher.service';

const n = new NormalizerService();
const f = new FuzzyMatcherService();
const pairs: [string, string][] = [
  [
    'LG 24U411A-B 24-inch Full HD (1920 x 1080) IPS Computer Monitor, 120Hz, HDR10, Reader Mode, Flicker Safe, HDMI, Slim Stand Base, Black',
    'LG 27U411A-B 27-inch Full HD (1920 x 1080) IPS Computer Monitor, 120Hz, HDR10, Reader Mode, Flicker Safe, HDMI, Slim Stand Base, Black',
  ],
  [
    'Philips 271V8LB 27" Framless Full HD (1920 x 1080) 100Hz Monitor, VESA, HDMI x 1, VGA Port x1, Eye Care, 4 Year Advance Replacement Warranty',
    'Philips 24 inch 100Hz Computer Monitor, Frameless Full HD (1920 x 1080), VESA, HDMI x1, VGA Port x1, Eye Care, 4 Year Advance Replacement Warranty, 241V8LB',
  ],
];
for (const [a, b] of pairs) {
  const ea = n.extractAttributes(a);
  const eb = n.extractAttributes(b);
  console.log('sizeA=', ea.displaySize, 'sizeB=', eb.displaySize, 'conflict=', f.detectDisplaySizeConflict(ea.displaySize, eb.displaySize));
}
