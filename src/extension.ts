import _ from 'lodash';
import * as vscode from 'vscode';
import execute from './actions';
import { getActions } from './actors';
import supportedDB from './supportedDB.json';

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
    const { path: targetDbDir } = dirs[0];

    const entitiesDirName = await vscode.window.showInputBox({
      placeHolder:
        'Enter the name of your entities folder. Leave it empty to use the chosen directory as the target directory.',
      prompt: 'Please enter the entities folder name (or leave it empty)',
      value: '',
    });
    if (!entitiesDirName) {
      vscode.window.showErrorMessage('Please enter a valid entities folder name');
      return;
    }

    const dbOptions = supportedDB.data.map(db => ({
      label: db.name,
      description: db.package,
      detail: `npm install ${db.package} --save`,
      link: db.source,
    }));
    const chosenDb= await vscode.window.showQuickPick(dbOptions, { matchOnDetail: true });
    if (!chosenDb) {
      vscode.window.showErrorMessage('Please select a valid DB');
      return;
    }

    const dbInfo = _.find(supportedDB.data, { name: chosenDb.label });
    if (!dbInfo) {
      return;
    }

    const actions = await getActions(format, targetDbDir, entitiesDirName, dbInfo, dbmlPath);
    execute(actions);

    vscode.window.showInformationMessage('Schema generated successfully!');
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}
