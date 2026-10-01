import * as assert from 'assert';
import ts from 'typescript';
import { GlobalSnapshotsManager } from '../../../src/plugins/typescript/SnapshotManager';

describe('TS/JS buffer replay', () => {
    const fileName = '/project/value.ts';
    const disk = 'export const value = 42;';
    const unsaved = 'export const value = "unsaved";';
    const system = { ...ts.sys, readFile: () => disk };

    it('creates a missing snapshot from a complete buffer and discards it on close', () => {
        const manager = new GlobalSnapshotsManager(system);
        const snapshot = manager.updateTsOrJsFile(fileName, [{ text: unsaved }]);
        assert.ok(snapshot);
        assert.strictEqual(snapshot.getText(0, snapshot.getLength()), unsaved);
        const restored = manager.updateTsOrJsFile(fileName)!;
        assert.strictEqual(restored.getText(0, restored.getLength()), disk);
        assert.ok(restored.version > snapshot.version);
    });

    it('does not invent a snapshot for an incremental edit without a baseline', () => {
        const manager = new GlobalSnapshotsManager(system);
        assert.strictEqual(
            manager.updateTsOrJsFile(fileName, [
                {
                    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
                    text: 'x'
                }
            ]),
            undefined
        );
    });
});
