// Run the QUnit suite (test/index.html) in headless Chrome and report results.
// Usage: node test/run-qunit-headless.js <url>
// Requires puppeteer-core and a Chrome binary (CHROME_BIN, default google-chrome).
"use strict";

var puppeteer = require( "puppeteer-core" );

var url = process.argv[ 2 ] || "http://localhost:8000/test/index.html",
	chrome = process.env.CHROME_BIN || "google-chrome",
	timeoutMs = 20 * 60 * 1000;

function hook() {
	if ( window !== window.top ) {
		return;
	}
	var timer = setInterval(function() {
		if ( !window.QUnit || !window.QUnit.done ) {
			return;
		}
		clearInterval( timer );
		var failedAsserts = [];
		window.QUnit.log(function( d ) {
			if ( !d.result ) {
				failedAsserts.push( ( d.message || "" ) +
					( "expected" in d ? " (expected: " + String( d.expected ) +
						", actual: " + String( d.actual ) + ")" : "" ) );
			}
		});
		window.QUnit.testDone(function( d ) {
			window.__qunitTestDone( {
				module: d.module, name: d.name, failed: d.failed,
				passed: d.passed, total: d.total, asserts: failedAsserts
			} );
			failedAsserts = [];
		});
		window.QUnit.done(function( d ) {
			window.__qunitDone( d );
		});
	}, 1 );
}

( async function() {
	var browser = await puppeteer.launch( {
		executablePath: chrome,
		headless: true,
		args: [ "--no-sandbox", "--disable-gpu" ]
	} );
	var page = await browser.newPage(),
		tests = 0, testsFailed = 0;

	var finished = new Promise(function( resolve ) {
		page.exposeFunction( "__qunitDone", resolve );
	});
	await page.exposeFunction( "__qunitTestDone", function( d ) {
		tests++;
		var status = d.failed ? "FAIL" : "PASS";
		if ( d.failed ) {
			testsFailed++;
		}
		console.log( status + " " + d.module + " :: " + d.name +
			" (" + d.passed + "/" + d.total + " assertions)" );
		d.asserts.forEach(function( a ) {
			console.log( "    failed assertion: " + a );
		});
	});
	await page.evaluateOnNewDocument( hook );
	page.on( "pageerror", function( e ) {
		console.log( "page error: " + e.message );
	});

	var timer = setTimeout(function() {
		console.log( "TIMEOUT after " + timeoutMs + "ms; tests reported so far: " + tests );
		process.exit( 2 );
	}, timeoutMs );

	await page.goto( url );
	var res = await finished;
	clearTimeout( timer );

	console.log( "" );
	console.log( "QUnit summary: " + ( tests - testsFailed ) + " of " + tests +
		" tests passed, " + testsFailed + " failed; " + res.passed + " of " + res.total +
		" assertions passed, " + res.failed + " failed (" + res.runtime + "ms)" );
	await browser.close();
	process.exit( res.failed || testsFailed ? 1 : 0 );
})().catch(function( e ) {
	console.log( e && e.stack || e );
	process.exit( 3 );
});
