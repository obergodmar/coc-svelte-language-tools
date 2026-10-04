import { EventEmitter } from 'events';

const configurationEventName = 'configuration-changed';

export interface Configuration {
    global?: boolean;
    /** Complete set of editor-owned Svelte buffers. Omitted by clients without overlay support. */
    svelteDocuments?: { fileName: string; text: string }[];
    enable: boolean;
    /** Skip the Svelte detection and assume this is a Svelte project */
    assumeIsSvelteProject: boolean;
}

export class ConfigManager {
    private emitter = new EventEmitter();
    private config: Configuration = {
        enable: true,
        assumeIsSvelteProject: false
    };

    onConfigurationChanged(listener: (config: Configuration) => void) {
        this.emitter.on(configurationEventName, listener);
    }

    removeConfigurationChangeListener(listener: (config: Configuration) => void) {
        this.emitter.off(configurationEventName, listener);
    }

    onSvelteDocumentsChanged(listener: (changedFiles: string[]) => void) {
        this.emitter.on('svelte-documents-changed', listener);
    }

    removeSvelteDocumentsChangeListener(listener: (changedFiles: string[]) => void) {
        this.emitter.off('svelte-documents-changed', listener);
    }

    isConfigChanged(config: Configuration) {
        // Overlay snapshots also need to be replayed when the enable state is unchanged.
        return config.enable !== this.config.enable || config.svelteDocuments !== undefined;
    }

    updateConfigFromPluginConfig(config: Configuration) {
        // TODO this doesn't work because TS will resolve/load files already before we get the config request,
        // which leads to TS files that use Svelte files getting all kinds of type errors
        // const shouldWaitForConfigRequest = config.global == true;
        // const enable = config.enable ?? !shouldWaitForConfigRequest;
        const previous = new Map(
            this.config.svelteDocuments?.map((doc) => [doc.fileName, doc.text])
        );
        const next =
            config.svelteDocuments === undefined
                ? previous
                : new Map(config.svelteDocuments.map((doc) => [doc.fileName, doc.text]));
        const changedFiles = [...new Set([...previous.keys(), ...next.keys()])].filter(
            (file) =>
                previous.get(file) !== next.get(file) ||
                (config.enable !== undefined && config.enable !== this.config.enable)
        );
        const overlaysOnly =
            config.svelteDocuments !== undefined && config.enable === this.config.enable;
        this.config = {
            ...this.config,
            ...config
        };
        // Buffer edits must not tear down directory watchers and project roots.
        if (!overlaysOnly) this.emitter.emit(configurationEventName, config);
        if (changedFiles.length) this.emitter.emit('svelte-documents-changed', changedFiles);
    }

    getConfig() {
        return this.config;
    }
}
