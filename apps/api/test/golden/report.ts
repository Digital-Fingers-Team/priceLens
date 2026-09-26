/**
 * Prints the golden-set precision/recall, forwards and backwards.
 *   cd apps/api && npx ts-node test/golden/report.ts [--verbose]
 */
import { GOLDEN_HOLDOUT, GOLDEN_LISTINGS } from './matching-golden.fixtures';
import { runGolden } from './golden-harness';

async function main() {
  const verbose = process.argv.includes('--verbose');
  for (const [label, listings] of [
    ['forward', GOLDEN_LISTINGS],
    ['reversed', [...GOLDEN_LISTINGS].reverse()],
    ['holdout', GOLDEN_HOLDOUT],
    ['holdout reversed', [...GOLDEN_HOLDOUT].reverse()],
  ] as const) {
    const result = await runGolden([...listings]);
    console.log(
      `${label}: listings=${listings.length} precision=${result.precision.toFixed(4)} recall=${result.recall.toFixed(4)} ` +
        `TP=${result.truePositives} FP=${result.falsePositives} FN=${result.falseNegatives} mixedProducts=${result.mixedProducts}`,
    );
    if (verbose) {
      for (const [a, b] of result.wrongMerges) console.log(`  WRONG  ${a}  <>  ${b}`);
      for (const [a, b] of result.missedMerges) console.log(`  MISSED ${a}  <>  ${b}`);
    }
  }
}

void main();
