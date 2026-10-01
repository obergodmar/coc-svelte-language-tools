import { workspace } from 'coc.nvim';

export const configurationSections = [
    'svelte',
    'typescript',
    'javascript',
    'prettier',
    'emmet',
    'html',
    'css',
    'scss',
    'less'
];

export function initializationOptions() {
    return {
        configuration: Object.fromEntries(
            configurationSections.map((section) => [section, workspace.getConfiguration(section)])
        )
    };
}
