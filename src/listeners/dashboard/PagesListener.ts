import { basename } from 'path';
import { commands, FileSystemWatcher, RelativePattern, TextDocument, Uri, workspace } from 'vscode';
import { Dashboard } from '../../commands/Dashboard';
import { Folders } from '../../commands/Folders';
import { COMMAND_NAME, ExtensionState } from '../../constants';
import { DashboardCommand } from '../../dashboardWebView/DashboardCommand';
import { DashboardMessage } from '../../dashboardWebView/DashboardMessage';
import { Page } from '../../dashboardWebView/models';
import { ArticleHelper, Extension, Logger } from '../../helpers';
import { BaseListener } from './BaseListener';
import { DataListener } from '../panel';
import Fuse from 'fuse.js';
import { PagesParser } from '../../services/PagesParser';
import { unlinkAsync } from '../../utils';

export class PagesListener extends BaseListener {
  private static watchers: { [path: string]: FileSystemWatcher } = {};
  private static lastPages: Page[] = [];

  /**
   * Process the messages for the dashboard views
   * @param msg
   */
  public static async process(msg: { command: DashboardMessage; data: any }) {
    super.process(msg);

    switch (msg.command) {
      case DashboardMessage.getData:
        this.getPagesData();
        break;
      case DashboardMessage.createContent:
        await commands.executeCommand(COMMAND_NAME.createContent);
        break;
      case DashboardMessage.createByContentType:
        await commands.executeCommand(COMMAND_NAME.createByContentType);
        break;
      case DashboardMessage.createByTemplate:
        await commands.executeCommand(COMMAND_NAME.createByTemplate);
        break;
      case DashboardMessage.refreshPages:
        this.getPagesData(true);
        break;
      case DashboardMessage.searchPages:
        this.searchPages(msg.data);
        break;
      case DashboardMessage.deleteFile:
        this.deletePage(msg.data);
        break;
    }
  }

  /**
   * Saved file watcher
   * @returns
   */
  public static saveFileWatcher() {
    return workspace.onDidSaveTextDocument((doc: TextDocument) => {
      if (ArticleHelper.isSupportedFile(doc)) {
        Logger.info(`File saved ${doc.uri.fsPath}`);
        // Optimize the list of recently changed files
        DataListener.getFoldersAndFiles();
        // Trigger the metadata update
        this.watcherExec(doc.uri);
      }
    });
  }

  /**
   * Start watching the folders in the current workspace for content changes
   */
  public static async startWatchers() {
    const folders = Folders.get();

    if (!folders || folders.length === 0) {
      return;
    }

    // Dispose all the current watchers
    const paths = Object.keys(this.watchers);
    for (const path of paths) {
      const watcher = this.watchers[path];
      watcher.dispose();
      delete this.watchers[path];
    }

    // Recreate all the watchers
    for (const folder of folders) {
      const folderUri = Uri.parse(folder.path);
      let watcher = workspace.createFileSystemWatcher(
        new RelativePattern(folderUri, '**/*'),
        false,
        false,
        false
      );
      watcher.onDidCreate(async (uri: Uri) => this.watcherExec(uri));
      watcher.onDidChange(async (uri: Uri) => this.watcherExec(uri));
      watcher.onDidDelete(async (uri: Uri) => this.watcherExec(uri));
      this.watchers[folderUri.fsPath] = watcher;
    }
  }

  /**
   * Delete a page
   * @param path
   */
  private static async deletePage(path: string) {
    if (!path) {
      return;
    }

    Logger.info(`Deleting file: ${path}`);

    await unlinkAsync(path);

    this.lastPages = this.lastPages.filter((p) => p.fmFilePath !== path);
    this.sendPageData(this.lastPages);

    const ext = Extension.getInstance();
    await ext.setState(ExtensionState.Dashboard.Pages.Cache, this.lastPages, 'workspace');
  }

  /**
   * Watcher for processing page updates
   * @param file
   */
  private static async watcherExec(file: Uri) {
    if (Dashboard.isOpen) {
      const ext = Extension.getInstance();
      Logger.info(`File watcher execution for: ${file.fsPath}`);

      const pageIdx = this.lastPages.findIndex((p) => p.fmFilePath === file.fsPath);
      if (pageIdx !== -1) {
        const stats = await workspace.fs.stat(file);
        const crntPage = this.lastPages[pageIdx];
        const updatedPage = await PagesParser.processPageContent(
          file.fsPath,
          stats.mtime,
          basename(file.fsPath),
          crntPage.fmFolder
        );
        if (updatedPage) {
          this.lastPages[pageIdx] = updatedPage;
          this.sendPageData(this.lastPages);
          await ext.setState(ExtensionState.Dashboard.Pages.Cache, this.lastPages, 'workspace');
        }
      } else {
        this.getPagesData(true);
      }
    }
  }

  /**
   * Retrieve all the markdown pages
   */
  private static async getPagesData(clear: boolean = false) {
    const ext = Extension.getInstance();

    // Get data from the cache
    if (!clear) {
      const cachedPages = await ext.getState<Page[]>(
        ExtensionState.Dashboard.Pages.Cache,
        'workspace'
      );
      if (cachedPages) {
        this.sendPageData(cachedPages);
      }
    } else {
      PagesParser.reset();
    }

    PagesParser.getPages(async (pages: Page[]) => {
      this.lastPages = pages;
      this.sendPageData(pages);

      this.sendMsg(DashboardCommand.searchReady, true);

      await this.createSearchIndex(pages);
    });
  }

  /**
   * Send the page data without the body
   */
  private static sendPageData(pages: Page[]) {
    // Omit the body content
    this.sendMsg(
      DashboardCommand.pages,
      pages.map((p) => {
        const { fmBody, ...rest } = p;
        return rest;
      })
    );
  }

  /**
   * Create the search index for the pages
   * @param pages
   */
  private static async createSearchIndex(pages: Page[]) {
    const pagesIndex = Fuse.createIndex(['title', 'slug', 'description', 'fmBody'], pages);
    await Extension.getInstance().setState(
      ExtensionState.Dashboard.Pages.Index,
      pagesIndex,
      'workspace'
    );
  }

  /**
   * Search the pages
   */
  private static async searchPages(data: { query: string }) {
    const fuseOptions: Fuse.IFuseOptions<Page> = {
      keys: [
        { name: 'title', weight: 1 },
        { name: 'fmBody', weight: 1 },
        { name: 'slug', weight: 0.5 },
        { name: 'description', weight: 0.5 }
      ],
      includeScore: true,
      ignoreLocation: true,
      threshold: 0.1
    };

    const pagesIndex = await Extension.getInstance().getState<Fuse.FuseIndex<Page>>(
      ExtensionState.Dashboard.Pages.Index,
      'workspace'
    );
    const fuse = new Fuse(this.lastPages, fuseOptions, pagesIndex);
    const results = fuse.search(data.query || '');
    const pageResults = results.map((page) => page.item);

    this.sendMsg(DashboardCommand.searchPages, pageResults);
  }

  /**
   * Get fresh page data
   */
  public static refresh() {
    this.getPagesData(true);
  }
}
