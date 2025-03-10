import {
  SETTING_DASHBOARD_OPENONSTART,
  CONTEXT,
  ExtensionState,
  SETTING_EXPERIMENTAL
} from '../constants';
import { join } from 'path';
import { commands, Uri, ViewColumn, Webview, WebviewPanel, window } from 'vscode';
import { Logger, Settings as SettingsHelper } from '../helpers';
import { DashboardCommand } from '../dashboardWebView/DashboardCommand';
import { Extension } from '../helpers/Extension';
import { WebviewHelper } from '@estruyf/vscode';
import { DashboardData } from '../models/DashboardData';
import {
  DashboardListener,
  MediaListener,
  SettingsListener,
  TelemetryListener,
  DataListener,
  PagesListener,
  ExtensionListener,
  SnippetListener,
  TaxonomyListener,
  LogListener
} from '../listeners/dashboard';
import { MediaListener as PanelMediaListener } from '../listeners/panel';
import { GitListener, ModeListener } from '../listeners/general';

export class Dashboard {
  private static webview: WebviewPanel | null = null;
  private static _viewData: DashboardData | undefined;
  private static isDisposed = true;

  public static get viewData(): DashboardData | undefined {
    return Dashboard._viewData;
  }

  /**
   * Init the dashboard
   */
  public static async init() {
    const openOnStartup = SettingsHelper.get(SETTING_DASHBOARD_OPENONSTART);
    if (openOnStartup) {
      Dashboard.open();
    }
  }

  /**
   * Open or reveal the dashboard
   */
  public static async open(data?: DashboardData) {
    Dashboard._viewData = data;

    if (Dashboard.isOpen) {
      Dashboard.reveal(!!data);
    } else {
      Dashboard.create();
    }

    await commands.executeCommand('setContext', CONTEXT.isDashboardOpen, true);
  }

  /**
   * Check if the dashboard is still open
   */
  public static get isOpen(): boolean {
    return !Dashboard.isDisposed;
  }

  /**
   * Reveal the dashboard if it is open
   */
  public static reveal(hasData = false) {
    if (Dashboard.webview) {
      Dashboard.webview.reveal();

      if (hasData) {
        Dashboard.postWebviewMessage({
          command: DashboardCommand.viewData,
          data: Dashboard.viewData
        });
      }
    }
  }

  public static close() {
    Dashboard.webview?.dispose();
  }

  public static reload() {
    if (Dashboard.isOpen) {
      Dashboard.webview?.dispose();
      Extension.getInstance().setState(
        ExtensionState.Dashboard.Pages.Cache,
        undefined,
        'workspace'
      );

      setTimeout(() => {
        Dashboard.open();
      }, 100);
    }
  }

  public static resetViewData() {
    Dashboard._viewData = undefined;
  }

  /**
   * Create the dashboard webview
   */
  public static async create() {
    const extensionUri = Extension.getInstance().extensionPath;

    // Create the preview webview
    Dashboard.webview = window.createWebviewPanel(
      'frontMatterDashboard',
      'FrontMatter Dashboard',
      ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    Dashboard.isDisposed = false;

    Dashboard.webview.iconPath = {
      dark: Uri.file(join(extensionUri.fsPath, 'assets/icons/frontmatter-short-dark.svg')),
      light: Uri.file(join(extensionUri.fsPath, 'assets/icons/frontmatter-short-light.svg'))
    };

    Dashboard.webview.webview.html = Dashboard.getWebviewContent(
      Dashboard.webview.webview,
      extensionUri
    );

    Dashboard.webview.onDidChangeViewState(async () => {
      if (!this.webview?.visible) {
        Dashboard._viewData = undefined;
        PanelMediaListener.getMediaSelection();

        Dashboard.postWebviewMessage({
          command: DashboardCommand.viewData,
          data: null
        });
      }

      await commands.executeCommand('setContext', CONTEXT.isDashboardOpen, this.webview?.visible);
    });

    Dashboard.webview.onDidDispose(async () => {
      Dashboard.isDisposed = true;
      Dashboard._viewData = undefined;
      PanelMediaListener.getMediaSelection();
      await commands.executeCommand('setContext', CONTEXT.isDashboardOpen, false);
    });

    SettingsHelper.onConfigChange(() => {
      SettingsListener.getSettings(true);
    });

    Dashboard.webview.webview.onDidReceiveMessage(async (msg) => {
      Logger.info(`Receiving message from webview: ${msg.command}`);

      DashboardListener.process(msg);
      ExtensionListener.process(msg);
      MediaListener.process(msg);
      PagesListener.process(msg);
      SettingsListener.process(msg);
      DataListener.process(msg);
      TelemetryListener.process(msg);
      SnippetListener.process(msg);
      ModeListener.process(msg);
      GitListener.process(msg);
      TaxonomyListener.process(msg);
      LogListener.process(msg);
    });
  }

  /**
   * Return the webview
   * @returns The webview
   */
  public static getWebview() {
    return Dashboard.webview?.webview;
  }

  /**
   * Post data to the dashboard
   * @param msg
   */
  public static postWebviewMessage(msg: { command: DashboardCommand; data?: unknown }) {
    if (Dashboard.isDisposed) {
      return;
    }

    if (Dashboard.webview) {
      Dashboard.webview?.webview.postMessage(msg);
    }
  }

  /**
   * Retrieve the webview HTML contents
   * @param webView
   */
  private static getWebviewContent(webView: Webview, extensionPath: Uri): string {
    const dashboardFile = 'dashboardWebView.js';
    const localPort = `9000`;
    const localServerUrl = `localhost:${localPort}`;

    let scriptUri = '';
    const isProd = Extension.getInstance().isProductionMode;
    if (isProd) {
      scriptUri = webView
        .asWebviewUri(Uri.joinPath(extensionPath, 'dist', dashboardFile))
        .toString();
    } else {
      scriptUri = `http://${localServerUrl}/${dashboardFile}`;
    }

    const nonce = WebviewHelper.getNonce();

    const ext = Extension.getInstance();
    const version = ext.getVersion();
    const isBeta = ext.isBetaVersion();

    // Get experimental setting
    const experimental = SettingsHelper.get(SETTING_EXPERIMENTAL);

    const csp = [
      `default-src 'none';`,
      `img-src ${`vscode-file://vscode-app`} ${
        webView.cspSource
      } https://api.visitorbadge.io 'self' 'unsafe-inline' https://*`,
      `media-src ${`vscode-file://vscode-app`} ${
        webView.cspSource
      } 'self' 'unsafe-inline' https://*`,
      `script-src ${
        isProd ? `'nonce-${nonce}'` : `http://${localServerUrl} http://0.0.0.0:${localPort}`
      } 'unsafe-eval'`,
      `style-src ${webView.cspSource} 'self' 'unsafe-inline'`,
      `font-src ${webView.cspSource}`,
      `connect-src https://o1022172.ingest.sentry.io ${
        isProd
          ? ``
          : `ws://${localServerUrl} ws://0.0.0.0:${localPort} http://${localServerUrl} http://0.0.0.0:${localPort}`
      }`
    ];

    return `
      <!DOCTYPE html>
      <html lang="en" style="width:100%;height:100%;margin:0;padding:0;">
      <head>
			  <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="${csp.join('; ')}">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">

        <title>Front Matter Dashboard</title>
      </head>
      <body style="width:100%;height:100%;margin:0;padding:0;overflow:hidden">
        <div id="app" class="bg-gray-100 text-vulcan-500 dark:bg-vulcan-500 dark:text-whisper-500" data-isProd="${isProd}" data-environment="${
      isBeta ? 'BETA' : 'main'
    }" data-version="${version.usedVersion}" style="width:100%;height:100%;margin:0;padding:0;" ${
      version.usedVersion ? '' : `data-showWelcome="true"`
    } ${experimental ? `data-experimental="${experimental}"` : ''} ></div>

        <img style="display:none" src="https://api.visitorbadge.io/api/combined?user=estruyf&repo=frontmatter-usage&countColor=%23263759&slug=${`dashboard-${version.installedVersion}`}" alt="Daily usage" />

        <script ${isProd ? `nonce="${nonce}"` : ''} src="${scriptUri}"></script>
      </body>
      </html>
    `;
  }
}
