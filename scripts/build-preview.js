import { buildOrchestrator } from '../src/engines/build-orchestrator.js';

async function main() {
  console.log('Running real preview build pipeline...');
  const summary = await buildOrchestrator.run('full');
  console.log('Build completed successfully:', summary);
}

main().catch(err => {
  console.error('Build execution failed:', err);
  process.exit(1);
});
