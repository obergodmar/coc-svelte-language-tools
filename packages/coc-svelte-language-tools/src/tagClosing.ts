import {
    Disposable,
    events,
    LanguageClient,
    Position,
    Range,
    snippetManager,
    window,
    workspace
} from 'coc.nvim';

/** Only act on a single typed character, never on paste, replacement or stale replies. */
export function activateTagClosing(client: LanguageClient): Disposable {
    let generation = 0;
    let timer: NodeJS.Timeout | undefined;
    const cancel = () => {
        generation++;
        clearTimeout(timer);
    };
    const change = workspace.onDidChangeTextDocument((event) => {
        cancel();
        const document = workspace.getDocument(event.textDocument.uri);
        const edit = event.contentChanges[0];
        if (
            !events.insertMode ||
            !client.isRunning() ||
            !document ||
            document.filetype !== 'svelte' ||
            event.contentChanges.length !== 1 ||
            !edit ||
            !('range' in edit) ||
            !edit.range ||
            !Position.is(edit.range.start) ||
            edit.range.start.line !== edit.range.end.line ||
            edit.range.start.character !== edit.range.end.character ||
            !['>', '/'].includes(edit.text) ||
            !workspace.getConfiguration('svelte', document.uri).get('autoClosingTags', true)
        )
            return;
        const current = generation;
        const version = document.version;
        const position = Position.create(edit.range.start.line, edit.range.start.character + 1);
        timer = setTimeout(() => {
            void (async () => {
                const text = await client.sendRequest<string | null>('html/tag', {
                    textDocument: { uri: document.uri },
                    position
                });
                if (
                    !text ||
                    current !== generation ||
                    !events.insertMode ||
                    document.version !== version
                )
                    return;
                const state = await workspace.getCurrentState();
                const cursor = await window.getCursorPosition();
                if (
                    state.document.uri !== document.uri ||
                    cursor.line !== position.line ||
                    cursor.character !== position.character ||
                    current !== generation ||
                    document.version !== version ||
                    !events.insertMode
                )
                    return;
                await snippetManager.insertSnippet(text, false, Range.create(position, position));
            })().catch((error) => client.outputChannel.appendLine(`Tag closing: ${error}`));
        }, 75);
    });
    const leave = events.on('InsertLeave', cancel);
    return Disposable.create(() => {
        cancel();
        change.dispose();
        leave.dispose();
    });
}
