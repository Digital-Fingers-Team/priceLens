import { runSeed } from '../seed/seed';

runSeed()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  });
