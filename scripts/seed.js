'use strict';

const { ensureSeeded } = require('../lib/seed-data');

ensureSeeded({ force: process.argv.includes('--force') })
  .then((result) => {
    console.log(
      result.generated
        ? 'Sample data written to ./data:'
        : 'Data store already present in ./data (use `npm run seed -- --force` to regenerate):'
    );
    for (const [key, count] of Object.entries(result.counts)) {
      console.log(`  ${key.padEnd(10)} ${String(count).padStart(6)}`);
    }
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
