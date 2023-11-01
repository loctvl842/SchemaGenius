import path from 'path';
import * as vscode from 'vscode';
import execute from './actions';
import { getActions } from './actors';

export function activate(context: vscode.ExtensionContext) {
  const supportedORM = ['TypeORM', 'Sequelize'];

  const disposable = vscode.commands.registerCommand('schemagenius.generateSchema', async () => {
    const format = await vscode.window.showQuickPick(supportedORM);
    if (!format) {
      vscode.window.showErrorMessage('Please select a format');
      return;
    }

    vscode.window.showInformationMessage('Please select a DBML file');
    const dbmlFiles = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: {
        'DBML Files': ['dbml'],
      },
    });
    if (!dbmlFiles) {
      return;
    }
    const { path: dbmlPath } = dbmlFiles[0];
    vscode.window.showInformationMessage('Please select a target directory');

    const dirs = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
    });
    if (!dirs) {
      return;
    }
    const { path: chosenDir } = dirs[0];

    const entitiesDir = await vscode.window.showInputBox({
      placeHolder:
        'Enter the name of your entities folder. Leave it empty to use the chosen directory as the target directory.',
      prompt: 'Please enter the entities folder name (or leave it empty)',
      value: '',
    });

    const targetDir = path.resolve(chosenDir, entitiesDir || '');

    const actions = await getActions(format, targetDir, dbmlPath);
    execute(actions);

    vscode.window.showInformationMessage('Schema generated successfully!');
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}
