import { MediaHelpers } from './MediaHelpers';
import { workspace } from 'vscode';
import { JsonDB } from 'node-json-db/dist/JsonDB';
import { basename, dirname, join, parse } from 'path';
import { Folders, WORKSPACE_PLACEHOLDER } from '../commands/Folders';
import { Notifications } from './Notifications';
import { parseWinPath } from './parseWinPath';
import { LocalStore } from '../constants';
import { existsAsync, renameAsync } from '../utils';

interface MediaRecord {
  description: string;
  alt: string;
}

export class MediaLibrary {
  private db: JsonDB | undefined;
  private static instance: MediaLibrary;

  private constructor() {
    const wsFolder = Folders.getWorkspaceFolder();
    if (!wsFolder) {
      return;
    }

    this.db = new JsonDB(
      join(
        parseWinPath(wsFolder?.fsPath || ''),
        LocalStore.rootFolder,
        LocalStore.contentFolder,
        LocalStore.mediaDatabaseFile
      ),
      true,
      false,
      '/'
    );

    workspace.onDidRenameFiles((e) => {
      e.files.forEach((f) => {
        const path = f.oldUri.path.toLowerCase();
        // Check if file is an image
        if (
          path.endsWith('.jpeg') ||
          path.endsWith('.jpg') ||
          path.endsWith('.png') ||
          path.endsWith('.gif')
        ) {
          this.rename(f.oldUri.fsPath, f.newUri.fsPath);
          MediaHelpers.resetMedia();
        }
      });
    });
  }

  public static getInstance(): MediaLibrary {
    if (!MediaLibrary.instance) {
      MediaLibrary.instance = new MediaLibrary();
    }

    return MediaLibrary.instance;
  }

  public get(id: string): MediaRecord | undefined {
    try {
      const fileId = this.parsePath(id);
      if (this.db?.exists(fileId)) {
        return this.db.getData(fileId);
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  public set(id: string, metadata: any): void {
    const fileId = this.parsePath(id);
    this.db?.push(fileId, metadata, true);
  }

  public rename(oldId: string, newId: string): void {
    const fileId = this.parsePath(oldId);
    const newFileId = this.parsePath(newId);
    const data = this.db?.getData(fileId);
    if (data) {
      this.db?.delete(fileId);
      this.db?.push(newFileId, data, true);
    }
  }

  public async updateFilename(filePath: string, filename: string) {
    const name = basename(filePath);

    if (name !== filename && filename) {
      try {
        const oldFileInfo = parse(filePath);
        const newFileInfo = parse(filename);
        const newPath = join(dirname(filePath), `${newFileInfo.name}${oldFileInfo.ext}`);

        if (await existsAsync(newPath)) {
          Notifications.warning(`The name "${filename}" already exists at the file location.`);
        } else {
          await renameAsync(filePath, newPath);
          this.rename(filePath, newPath);
          MediaHelpers.resetMedia();
        }
      } catch (err) {
        Notifications.error(`Something went wrong updating "${name}" to "${filename}".`);
      }
    }
  }

  private parsePath(path: string) {
    const wsFolder = Folders.getWorkspaceFolder();
    const isWindows = process.platform === 'win32';
    let absPath = path.replace(parseWinPath(wsFolder?.fsPath || ''), WORKSPACE_PLACEHOLDER);
    absPath = isWindows ? absPath.split('\\').join('/') : absPath;
    return absPath.toLowerCase();
  }
}
