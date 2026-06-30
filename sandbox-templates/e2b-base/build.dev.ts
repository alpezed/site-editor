import 'dotenv/config';
import { Template, defaultBuildLogger } from 'e2b';
import { template } from './template';

/** Dev alias — point E2B_TEMPLATE at this while iterating on the template. */
export const ALIAS = 'site-editor-base-dev';

async function main() {
	await Template.build(template, ALIAS, {
		cpuCount: 2,
		memoryMB: 4096,
		onBuildLogs: defaultBuildLogger(),
	});
	console.log(`\n✓ Built "${ALIAS}". Set E2B_TEMPLATE=${ALIAS} to use it.`);
}

main().catch(err => {
	console.error(err);
	process.exit(1);
});
