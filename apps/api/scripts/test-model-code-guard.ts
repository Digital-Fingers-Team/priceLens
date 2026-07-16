import { FuzzyMatcherService } from '../src/matching/fuzzy-matcher.service';

const f = new FuzzyMatcherService();

const cases: [string, string, boolean, string][] = [
  ['AMD Ryzen 7 7700 8-Core, 16-Thread Unlocked Desktop Processor', 'AMD Ryzen 7 7700X 8-Core, 16-Thread Unlocked Desktop Processor', true, 'AMD suffix conflict'],
  ['Oppo A6 - 8GB RAM - 256GB - Aurora Gold', 'OPPO A6 Smartphone, 256 GB, Aurora Gold, Dual SIM, 8 GB RAM, 5G', false, 'real duplicate, diff wording'],
  ['RENO 15 12GB /512GB 5G -TWILIGHT BLUE', 'OPPO Reno15 5G - 12GB RAM - 512GB - Twilight Blue', false, 'real duplicate, diff wording'],
  ['Sony WH-1000XM5 Premium Noise Canceling Headphones, Auto NC Optimizer, 30-Hour Battery, Alexa Voice Control, Black | Auto Nc Optimizer, Up to 30-Hour Battery, Alexa and Google Voice Control, Ldac Bluetooth 5.2', 'Sony WH-1000XM5 Premium Noise Canceling Headphones, Auto NC Optimizer, 30-Hour Battery, Alexa Voice Control, Black', false, 'real duplicate, truncated title'],
  ['SAMSUNG 32-Inch Class Full HD F6000 Smart TV (2025 Model) HDR, Object Tracking Sound Lite, Knox Security, One UI Tizen, Smart TV', 'Samsung 32-Inch Class HD H5000F Smart TV (2025 Model) HDR, Object Tracking Sound Lite, Knox Security, One UI Tizen', false, 'F6000 vs H5000F: NOT caught by this rule on purpose (no shared digit core) -- relies on LLM'],
  ['HP 15-fd1018ne Laptop, Intel Core Ultra 7 155H, 16GB RAM, 512GB SSD, 15.6-Inch FHD IPS, Intel Arc Graphics Card, Windows 11 Home, Natural Silver', 'HP 15-fd1018ne Laptop, Intel Core Ultra 7 155H, 16GB RAM, 512GB SSD, 15.6-Inch FHD IPS, Intel Arc Graphics Card, Windows 11 Home, Natural Silver, CD8B8EA', false, 'one listing has an extra internal SKU code the other omits -- must NOT conflict'],
  ['ASUS ROG Strix GeForce RTX 4080 OC Edition Gaming Graphics Card', 'ASUS ROG Strix GeForce RTX 4080 Super OC Edition Gaming Graphics Card', false, 'RTX 4080 vs 4080 Super: relies on detectVariantConflict, not this rule'],
  ['RTX 4080 Graphics Card 16GB', 'RTX 4080Ti Graphics Card 16GB', true, 'glued suffix conflict, same digit core'],
];

let pass = 0;
for (const [a, b, expectConflict, label] of cases) {
  const result = f.detectModelCodeSuffixConflict(a, b);
  const got = result !== null;
  const ok = got === expectConflict;
  pass += ok ? 1 : 0;
  console.log(`${ok ? 'PASS' : 'FAIL'}  expected=${expectConflict} got=${got} (${result ?? 'null'})  ${label}`);
}
console.log(`\n${pass}/${cases.length} passed`);
