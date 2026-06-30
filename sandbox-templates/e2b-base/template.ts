// mythos-site-base — custom E2B template for the website builder.
//
// Migrated from e2b.Dockerfile (kept as e2b.Dockerfile.old) to the e2b v2.31
// `Template()` SDK builder. Build with `npm run e2b:build:dev` /
// `npm run e2b:build:prod`; see ./README.md. The default E2B `base` template
// is 512 MB / 1 vCPU with no deps pre-installed — too small for Next 15 dev
// compile and too slow on a cold `npm install`. This template fixes both.
import { Template } from 'e2b';

export const template = Template()
	.fromImage('node:20-slim')
	.setUser('root')
	.setWorkdir('/')
	// curl: used by manager.ts's in-sandbox port probe + dev-supervisor health check.
	// ca-certificates: so npm/git can talk HTTPS. git: used when customers import repos.
	.runCmd(
		'apt-get update && apt-get install -y --no-install-recommends curl ca-certificates git && rm -rf /var/lib/apt/lists/*'
	)
	// Matches APP_DIR in lib/editor-sandbox/manager.ts. Sandbox.files.write at boot
	// lands the customer overlay here; pre-installed node_modules survive (the
	// overlay writes app/, components/, lib/, … never node_modules/).
	.setWorkdir('/home/user/app')
	// Pre-install the shared dep set so `npm install` at boot is a near no-op.
	// package.json here mirrors sandbox-templates/_shared/package.json — the
	// customer's hydrated package.json overwrites it at boot but the dep set is
	// identical (only the `name` field changes), so the cached tree stays valid.
	.copy('package.json', './')
	.runCmd(
		'npm install --no-audit --no-fund --loglevel=warn && npm cache clean --force'
	)
	// Pre-create Next's auxiliary dirs so the first dev compile has them ready.
	.runCmd('mkdir -p .next public')
	// Next 15 + Babel dev compile routinely needs ~1.5 GB of V8 old-space; the
	// default ~512 MB cap aborts mid-route with "Reached heap limit" and kills
	// the dev server (port 3000 dies → "Closed Port Error"). 4 GB total per the
	// build resource opts, so a 2 GB heap leaves room for the OS.
	.setEnvs({
		NODE_OPTIONS: '--max-old-space-size=2048',
	})
	.setEnvs({
		NODE_ENV: 'development',
	})
	// No CMD/ENTRYPOINT on purpose — E2B's envd is the entrypoint. After mounting
	// overlay files, manager.ts writes + launches dev-supervisor.sh (curl + bash
	// builtins only) which keeps `next dev` bound to port 3000 across crashes and
	// pause/resume. The template's only job: be ready for that in <10 s.
	.setUser('user');
