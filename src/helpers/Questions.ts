import { window } from 'vscode';
import { Folders } from '../commands/Folders';
import { ContentType } from './ContentType';
import { Notifications } from './Notifications';

export class Questions {
  /**
   * Yes/No question
   * @param placeholder
   * @returns
   */
  public static async yesOrNo(placeholder: string) {
    const answer = await window.showQuickPick(['yes', 'no'], {
      placeHolder: placeholder,
      canPickMany: false,
      ignoreFocusOut: true
    });
    return answer === 'yes';
  }

  /**
   * Specify the name of the content to create
   * @param showWarning
   * @returns
   */
  public static async ContentTitle(showWarning: boolean = true): Promise<string | undefined> {
    const title = await window.showInputBox({
      title: 'Title',
      prompt: `What would you like to use as a title for the content to create?`,
      placeHolder: `Content title`,
      ignoreFocusOut: true
    });

    if (!title && showWarning) {
      Notifications.warning(`You did not specify a title for your content.`);
      return;
    }

    return title;
  }

  /**
   * Select the folder for your content creation
   * @param showWarning
   * @returns
   */
  public static async SelectContentFolder(
    showWarning: boolean = true
  ): Promise<string | undefined> {
    let folders = Folders.get();

    let selectedFolder: string | undefined;
    if (folders.length > 1) {
      selectedFolder = await window.showQuickPick(
        folders.map((f) => f.title),
        {
          title: `Select a folder`,
          placeHolder: `Select where you want to create your content`,
          ignoreFocusOut: true
        }
      );
    } else if (folders.length === 1) {
      selectedFolder = folders[0].title;
    } else {
      Notifications.warning(`No page folders were configures.`);
      return;
    }

    if (!selectedFolder && showWarning) {
      Notifications.warning(`You didn't select a place where you wanted to create your content.`);
      return;
    }

    return selectedFolder;
  }

  /**
   * Select the content type to create new content
   * @param allowedCts Allowed content types for the folder
   * @param showWarning
   * @returns
   */
  public static async SelectContentType(
    allowedCts: string[],
    showWarning: boolean = true
  ): Promise<string | undefined> {
    let contentTypes = ContentType.getAll();
    if (!contentTypes || contentTypes.length === 0) {
      Notifications.warning('No content types found. Please create a content type first.');
      return;
    }

    // Only allow content types that are allowed for the folder
    if (allowedCts && allowedCts.length > 0) {
      contentTypes = contentTypes.filter((ct) =>
        allowedCts.find((allowedCt) => allowedCt === ct.name)
      );
    }

    if (contentTypes.length === 1) {
      return contentTypes[0].name;
    }

    const options = contentTypes.map((contentType) => ({
      label: contentType.name
    }));

    const selectedOption = await window.showQuickPick(options, {
      title: `Content type`,
      placeHolder: `Select the content type to create your new content`,
      canPickMany: false,
      ignoreFocusOut: true
    });

    if (!selectedOption && showWarning) {
      Notifications.warning('No content type was selected.');
      return;
    }

    return selectedOption?.label;
  }
}
