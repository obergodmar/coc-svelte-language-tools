export function isScript(uri: string): boolean {
    return /\.(?:[cm]?[jt]s|[jt]sx)$/.test(uri);
}

export function isConfiguration(uri: string): boolean {
    return /\/(?:svelte\.config\.[cm]?[jt]s|vite\.config\.[cm]?[jt]s|(?:ts|js)config(?:\.[^/]+)?\.json|\.prettierrc(?:\.[^/]+)?|prettier\.config\.[cm]?[jt]s)$/.test(
        uri
    );
}
