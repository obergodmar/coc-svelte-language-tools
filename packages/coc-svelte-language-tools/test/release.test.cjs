const assert = require('node:assert/strict');
const { test } = require('node:test');
const { releaseVersion, newer } = require('../scripts/release.cjs');

test('CI versions are stable, increasing and identical on rerun', () => {
    assert.equal(releaseVersion('0.2.0', '19'), '0.2.19');
    assert.equal(releaseVersion('0.2.0', '19'), releaseVersion('0.2.0', '19'));
    assert.equal(releaseVersion('0.2.5', '19'), '0.2.24');
    assert.ok(newer('0.2.100', '0.2.99'));
    assert.ok(newer('0.3.1', '0.2.999'));
    assert.ok(!newer('0.2.99', '0.2.100'));
    assert.ok(!newer('0.2.99', '0.2.99'));
    for (const run of [undefined, '0', '-1', '1.1', '01', 'x']) {
        assert.throws(() => releaseVersion('0.2.0', run));
    }
    assert.throws(() => releaseVersion('0.2.0-beta', '1'));
});
