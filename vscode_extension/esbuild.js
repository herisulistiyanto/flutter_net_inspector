const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				if (location) {
					console.error(`    ${location.file}:${location.line}:${location.column}:`);
				}
			});
			console.log('[watch] build finished');
		});
	},
};

const extensionConfig = {
	plugins: [
		esbuildProblemMatcherPlugin
	],
	entryPoints: ["src/extension.ts"],
    bundle: true,
    format: "cjs",
    minify: production,
    minifyWhitespace: production,
    minifyIdentifiers: production,
    minifySyntax: production,
    treeShaking: true,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    target: "node18",
    outfile: "out/extension.js",
    external: ["vscode"],
    logLevel: "info",
    legalComments: "none",
    drop: production ? ["debugger"] : [],
    metafile: true,
    keepNames: false,
};

async function main() {
	if (watch) {
		const ctx = await esbuild.context(extensionConfig);
		await ctx.watch();
	} else {
		await esbuild.build(extensionConfig);
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
