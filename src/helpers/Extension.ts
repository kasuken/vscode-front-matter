import { basename } from 'path';
import {
  extensions,
  Uri,
  ExtensionContext,
  window,
  workspace,
  commands,
  ExtensionMode,
  DiagnosticCollection,
  languages
} from 'vscode';
import { Folders } from '../commands/Folders';
import { Template } from '../commands/Template';
import {
  EXTENSION_NAME,
  GITHUB_LINK,
  SETTING_DATE_FIELD,
  SETTING_MODIFIED_FIELD,
  EXTENSION_BETA_ID,
  EXTENSION_ID,
  ExtensionState,
  CONFIG_KEY,
  SETTING_CONTENT_PAGE_FOLDERS,
  SETTING_DASHBOARD_MEDIA_SNIPPET,
  SETTING_CONTENT_SNIPPETS,
  SETTING_TEMPLATES_ENABLED
} from '../constants';
import { ContentFolder, Snippet } from '../models';
import { Notifications } from './Notifications';
import { Settings } from './SettingsHelper';

export class Extension {
  private static instance: Extension;
  private _collection: DiagnosticCollection;

  private constructor(private ctx: ExtensionContext) {
    this._collection = languages.createDiagnosticCollection(this.title);
  }

  /**
   * Creates the singleton instance for the panel
   * @param extPath
   */
  public static getInstance(ctx?: ExtensionContext): Extension {
    if (!Extension.instance && ctx) {
      Extension.instance = new Extension(ctx);
    }

    return Extension.instance;
  }

  /**
   * Get the current version information for the extension
   */
  public getVersion(): {
    usedVersion: string | undefined;
    installedVersion: string;
  } {
    const frontMatter = extensions.getExtension(
      this.isBetaVersion() ? EXTENSION_BETA_ID : EXTENSION_ID
    )!;
    let installedVersion = frontMatter.packageJSON.version;
    const usedVersion = this.ctx.globalState.get<string>(ExtensionState.Version);

    if (this.isBetaVersion()) {
      installedVersion = `${installedVersion}-beta`;
    }

    if (usedVersion !== installedVersion) {
      const whatIsNewTitle = `Check the changelog`;
      const githubTitle = `Give it a ⭐️`;

      const whatIsNew = {
        title: whatIsNewTitle,
        run: () => {
          const uri = Uri.file(`${Extension.getInstance().extensionPath.fsPath}/CHANGELOG.md`);
          workspace.openTextDocument(uri).then(() => {
            commands.executeCommand('markdown.showPreview', uri);
          });
        }
      };

      const starGitHub = {
        title: githubTitle,
        run: () => {
          commands.executeCommand('vscode.open', Uri.parse(GITHUB_LINK));
        }
      };

      window
        .showInformationMessage(
          `${EXTENSION_NAME} has been updated to v${installedVersion} — check out what's new!`,
          starGitHub,
          whatIsNew
        )
        .then((selection) => {
          if (selection?.title === whatIsNewTitle || selection?.title === githubTitle) {
            selection.run();
          }
        });

      this.setVersion(installedVersion);
    }

    return {
      usedVersion,
      installedVersion
    };
  }

  /**
   * Get the title of the extension
   */
  public get title(): string {
    return this.ctx.extension.packageJSON.name;
  }

  /**
   * Get the displayName of the extension
   */
  public get displayName(): string {
    return this.ctx.extension.packageJSON.displayName;
  }

  /**
   * Returns the extension's version
   */
  public get version(): string {
    return this.ctx.extension.packageJSON.version;
  }

  /**
   * Check if the extension is in production/development mode
   */
  public get isProductionMode(): boolean {
    return this.ctx.extensionMode === ExtensionMode.Production;
  }

  /**
   * Get the diagnostic collection for the extension
   */
  public get diagnosticCollection(): DiagnosticCollection {
    return this._collection;
  }

  /**
   * Get extension subscriptions
   */
  public get subscriptions() {
    return this.ctx.subscriptions;
  }

  /**
   * Set the current version information for the extension
   */
  public setVersion(installedVersion: string): void {
    this.ctx.globalState.update(ExtensionState.Version, installedVersion);
  }

  /**
   * Get the path to the extension
   */
  public get extensionPath(): Uri {
    return this.ctx.extensionUri;
  }

  /**
   * Migrate old settings to new settings
   */
  public async migrateSettings(): Promise<void> {
    const versionInfo = this.getVersion();
    if (versionInfo.usedVersion === undefined) {
      return;
    }

    if (!versionInfo.usedVersion) {
      return;
    }

    // Split semantic version
    const version = versionInfo.usedVersion.split('.');
    const major = parseInt(version[0]);
    const minor = parseInt(version[1]);
    const patch = parseInt(version[2]);

    // Create team settings
    if (Settings.hasSettings()) {
      await Settings.createTeamSettings();
    }

    const hideDateDeprecation = await Extension.getInstance().getState<boolean>(
      ExtensionState.Updates.v7_0_0.dateFields,
      'workspace'
    );
    if (!hideDateDeprecation) {
      // Migration scripts can be written here
      const publishField = Settings.inspect(SETTING_DATE_FIELD);
      const modifiedField = Settings.inspect(SETTING_MODIFIED_FIELD);

      // Check for extension deprecations
      if (
        publishField?.workspaceValue ||
        publishField?.globalValue ||
        publishField?.teamValue ||
        modifiedField?.workspaceValue ||
        modifiedField?.globalValue ||
        modifiedField?.teamValue
      ) {
        Notifications.warning(
          `The "${CONFIG_KEY}.${SETTING_DATE_FIELD}" and "${CONFIG_KEY}.${SETTING_MODIFIED_FIELD}" settings have been deprecated. Please use the "isPublishDate" and "isModifiedDate" datetime field properties instead.`,
          'Hide',
          'See migration guide'
        ).then(async (value) => {
          if (value === 'See migration guide') {
            const isProd = this.isProductionMode;
            commands.executeCommand(
              'vscode.open',
              Uri.parse(
                `https://${
                  isProd ? '' : 'beta.'
                }frontmatter.codes/docs/troubleshooting#publish-and-modified-date-migration`
              )
            );
            await Extension.getInstance().setState<boolean>(
              ExtensionState.Updates.v7_0_0.dateFields,
              true,
              'workspace'
            );
          } else if (value === 'Hide') {
            await Extension.getInstance().setState<boolean>(
              ExtensionState.Updates.v7_0_0.dateFields,
              true,
              'workspace'
            );
          }
        });
      }
    }

    if (major < 7) {
      const contentFolders: ContentFolder[] = Settings.get(
        SETTING_CONTENT_PAGE_FOLDERS
      ) as ContentFolder[];
      const wsFolder = Folders.getWorkspaceFolder();
      if (wsFolder) {
        let update = false;

        for (const cFolder of contentFolders) {
          if (cFolder.path.indexOf(wsFolder.fsPath) !== -1) {
            update = true;
            cFolder.path = Folders.relWsFolder(cFolder, wsFolder);
          }
        }

        if (update) {
          Folders.update(contentFolders);
        }
      }
    }

    if (major <= 7 && minor < 3) {
      const mediaSnippet = Settings.get<string[]>(SETTING_DASHBOARD_MEDIA_SNIPPET);
      if (mediaSnippet && mediaSnippet.length > 0) {
        let snippet = mediaSnippet.join(`\n`);

        snippet = snippet.replace(`{mediaUrl}`, `[[&mediaUrl]]`);
        snippet = snippet.replace(`{mediaHeight}`, `[[mediaHeight]]`);
        snippet = snippet.replace(`{mediaWidth}`, `[[mediaWidth]]`);
        snippet = snippet.replace(`{caption}`, `[[&caption]]`);
        snippet = snippet.replace(`{alt}`, `[[alt]]`);
        snippet = snippet.replace(`{filename}`, `[[filename]]`);
        snippet = snippet.replace(`{title}`, `[[title]]`);

        const snippets = Settings.get<Snippet[]>(SETTING_CONTENT_SNIPPETS) || ({} as any);
        snippets[`Media snippet (migrated)`] = {
          body: snippet.split(`\n`),
          isMediaSnippet: true,
          description: `Migrated media snippet from frontMatter.dashboard.mediaSnippet setting`
        };

        await Settings.update(SETTING_CONTENT_SNIPPETS, snippets, true);
      }

      const templates = await Template.getTemplates();
      if (templates && templates.length > 0) {
        const answer = await window.showQuickPick(['Yes', 'No'], {
          title: 'Front Matter - Templates',
          placeHolder: 'Do you want to keep on using the template functionality?',
          ignoreFocusOut: true
        });

        await Settings.update(
          SETTING_TEMPLATES_ENABLED,
          answer?.toLocaleLowerCase() === 'yes',
          true
        );
      }
    }
  }

  public async setState<T>(
    propKey: string,
    propValue: T,
    type: 'workspace' | 'global' = 'global',
    setState: boolean = false
  ): Promise<void> {
    if (this.isFileStorageNeeded(propKey)) {
      let storageUri: Uri | undefined = undefined;
      if (type === 'global') {
        storageUri = await this.createGlobalStorageIfNotExists();
      } else {
        storageUri = await this.createLocalStorageIfNotExists();
      }

      if (storageUri) {
        const workspaceData = Uri.joinPath(
          storageUri,
          `${this.formatStorageFileName(propKey)}.json`
        );
        const writeData = new TextEncoder().encode(JSON.stringify(propValue));
        await workspace.fs.writeFile(workspaceData, writeData);

        if (!setState) {
          return;
        }
      }
    }

    if (type === 'global') {
      await this.ctx.globalState.update(propKey, propValue);
    } else {
      await this.ctx.workspaceState.update(propKey, propValue);
    }
  }

  public async getState<T>(
    propKey: string,
    type: 'workspace' | 'global' = 'global'
  ): Promise<T | undefined> {
    if (this.isFileStorageNeeded(propKey)) {
      let storageUri: Uri | undefined = undefined;
      if (type === 'global') {
        storageUri = await this.createGlobalStorageIfNotExists();
      } else {
        storageUri = await this.createLocalStorageIfNotExists();
      }

      if (storageUri) {
        try {
          const workspaceData = Uri.joinPath(
            storageUri,
            `${this.formatStorageFileName(propKey)}.json`
          );
          const fileData = await workspace.fs.readFile(workspaceData);

          if (fileData) {
            const jsonData = new TextDecoder().decode(fileData);
            return JSON.parse(jsonData);
          }
        } catch (e) {
          // File doesn't exist, go and check if available on normal state
        }
      }
    }

    if (type === 'global') {
      return await this.ctx.globalState.get(propKey);
    } else {
      return await this.ctx.workspaceState.get(propKey);
    }
  }

  public isBetaVersion() {
    return basename(this.ctx.globalStorageUri.fsPath) === EXTENSION_BETA_ID;
  }

  public checkIfExtensionCanRun() {
    if (this.isBetaVersion()) {
      const mainVersionInstalled = extensions.getExtension(EXTENSION_ID);

      if (mainVersionInstalled) {
        Notifications.error(
          `Front Matter BETA cannot be used while the main version is installed. Please ensure that you have only over version installed.`
        );
        return false;
      }
    }

    return true;
  }

  public asAbsolutePath(path: string) {
    return this.ctx.asAbsolutePath(path);
  }

  public get packageJson() {
    const frontMatter = extensions.getExtension(
      this.isBetaVersion() ? EXTENSION_BETA_ID : EXTENSION_ID
    )!;
    return frontMatter.packageJSON;
  }

  /**
   * Checks if the storage key needs to be stored in a file
   * @param propKey
   * @returns
   */
  private isFileStorageNeeded(propKey: string) {
    return propKey === ExtensionState.Dashboard.Pages.Cache;
  }

  /**
   * Replace special characters in the storage file name
   * @param propKey
   * @returns
   */
  private formatStorageFileName(propKey: string) {
    return propKey.replace(/:/g, '.');
  }

  /**
   * Validates if the global storage path exists
   */
  private async createGlobalStorageIfNotExists() {
    if (!this.ctx.globalStorageUri) {
      return;
    }

    try {
      // When folder doesn't exist, and error gets thrown
      await workspace.fs.stat(this.ctx.globalStorageUri);
    } catch {
      await workspace.fs.createDirectory(this.ctx.globalStorageUri);
    }

    return this.ctx.globalStorageUri;
  }

  /**
   * Validates if the storage path exists
   */
  private async createLocalStorageIfNotExists() {
    if (!this.ctx.storageUri) {
      return;
    }

    try {
      // When folder doesn't exist, and error gets thrown
      await workspace.fs.stat(this.ctx.storageUri);
    } catch {
      await workspace.fs.createDirectory(this.ctx.storageUri);
    }

    return this.ctx.storageUri;
  }
}
