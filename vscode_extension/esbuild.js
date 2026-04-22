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
    external: ["vscode", "ws"],
    logLevel: "info",
    legalComments: "none",
    drop: production ? ["debugger"] : [],
    metafile: true,
    keepNames: false,
};

// Webview bundle — CodeMirror 6 JSON editor (runs in the browser sandbox)
const webviewEditorConfig = {
	plugins: [
		esbuildProblemMatcherPlugin
	],
	entryPoints: ["webview/src/json-editor.js"],
	bundle: true,
	format: "iife",
	minify: production,
	minifyWhitespace: production,
	minifyIdentifiers: production,
	minifySyntax: production,
	treeShaking: true,
	sourcemap: !production,
	sourcesContent: false,
	platform: "browser",
	target: "es2020",
	outfile: "webview/cm-editor.js",
	logLevel: "info",
	legalComments: "none",
	metafile: true,
};

async function main() {
	if (watch) {
		const [extCtx, webCtx] = await Promise.all([
			esbuild.context(extensionConfig),
			esbuild.context(webviewEditorConfig),
		]);
		await Promise.all([extCtx.watch(), webCtx.watch()]);
	} else {
		await Promise.all([
			esbuild.build(extensionConfig),
			esbuild.build(webviewEditorConfig),
		]);
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
