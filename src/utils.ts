import chalk from 'chalk';
import { exec } from 'child_process';
import fs from 'fs';
import _ from 'lodash';
import path from 'path';
import { promisify } from 'util';

export function pgTypeToTsType(columnType: string) {
  switch (columnType) {
    case 'bpchar':
    case 'char':
    case 'varchar':
    case 'text':
    case 'citext':
    case 'uuid':
    case 'bytea':
    case 'inet':
    case 'time':
    case 'timetz':
    case 'interval':
    case 'name':
      return 'string';
    case 'int':
    case 'decimal':
    case 'int2':
    case 'int4':
    case 'int8':
    case 'float4':
    case 'float8':
    case 'numeric':
    case 'money':
    case 'oid':
      return 'number';
    case 'bool':
      return 'boolean';
    case 'json':
    case 'jsonb':
      return 'Json';
    case 'date':
    case 'timestamp':
    case 'timestamptz':
      return 'Date';
    case '_int2':
    case '_int4':
    case '_int8':
    case '_float4':
    case '_float8':
    case '_numeric':
    case '_money':
      return 'number[]';
    case '_bool':
      return 'boolean[]';
    case '_varchar':
    case '_text':
    case '_citext':
    case '_uuid':
    case '_bytea':
      return 'string[]';
    case '_json':
    case '_jsonb':
      return 'Json[]';
    case '_timestamptz':
      return 'Date[]';
    default:
      return 'any';
  }
}

export function logAction(type: string, msg: string) {
  return `[${type.toUpperCase()}] ${msg}`;
}

export function formatLogMsg(status: 'info' | 'error' | 'warn' | 'ok', message: string, title?: string): string {
  let formatStatusBg;
  switch (status.toLowerCase()) {
    case 'info':
      formatStatusBg = chalk.hex('#221f22').bold.bgHex('#78dce8');
      break;
    case 'error':
      formatStatusBg = chalk.hex('#221f22').bold.bgHex('#ff6188');
      break;
    case 'warn':
      formatStatusBg = chalk.hex('#221f22').bold.bgHex('#fc9867');
      break;
    case 'ok':
      formatStatusBg = chalk.hex('#221f22').bold.bgHex('#a9dc76');
      break;
    default:
      throw new Error(`Unknown status: ${status}`);
  }
  const formatStatus = `${formatStatusBg(` ${status.toUpperCase()} `)}`;
  const formatTitle = title ? `${chalk.bold.white(title)}:\n` : '';
  return `${formatStatus} ${formatTitle}${message}`;
}

function getRoot(currentDir: string, rootFiles: string[]): string | undefined {
  if (currentDir === path.parse(currentDir).root) {
    return undefined;
  }
  const foundRootFile = _.find(rootFiles, rootFile => fs.existsSync(path.join(currentDir, rootFile)));
  if (foundRootFile) {
    return currentDir;
  }
  return getRoot(path.resolve(currentDir, '..'), rootFiles);
}

export async function getRootOfDir(targetDir: string): Promise<string> {
  const rootPath = getRoot(targetDir, ['package.json', 'yarn.lock', 'package-lock.json']);
  if (rootPath === undefined) {
    throw new Error(`Can't find root of ${targetDir}`);
  }
  return rootPath;
}

export async function asyncExec(command: string): Promise<ExecResult> {
  console.info(formatLogMsg('info', `Executing ${chalk.green(command)}`));
  const res = await promisify(exec)(command);
  return res;
}

export async function detectPackageManager(targetDir: string): Promise<'npm' | 'yarn'> {
  const rootOfTargetDir = await getRootOfDir(targetDir);
  if (fs.existsSync(path.join(rootOfTargetDir, 'package-lock.json'))) {
    return 'npm';
  }
  if (fs.existsSync(path.join(rootOfTargetDir, 'yarn.lock'))) {
    return 'yarn';
  }
  await asyncExec(`yarn install --dev --cwd ${rootOfTargetDir}`);
  return 'yarn';
}

interface ExecResult {
  stdout: string;
  stderr: string;
}

export async function isInstalled(packageName: string, targetDir: string): Promise<boolean> {
  try {
    const rootOfTargetDir = await getRootOfDir(targetDir);

    const packagePath = path.resolve(rootOfTargetDir, 'node_modules', packageName);
    await fs.promises.access(packagePath, fs.constants.F_OK);

    const packageJsonPath = `${rootOfTargetDir}/package.json`;
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    const deps = packageJson.dependencies || {};
    const devDeps = packageJson.devDependencies || {};
    return (
      Object.prototype.hasOwnProperty.call(deps, packageName)
      || Object.prototype.hasOwnProperty.call(devDeps, packageName)
    );
  } catch (e) {
    return false;
  }
}

export async function install(packageNames: string[], targetDir: string, options?: { dev?: boolean }): Promise<void> {
  const unInstalledPackages = (
    await Promise.all(
      packageNames.map(async name => {
        if (!(await isInstalled(name, targetDir))) {
          return name;
        }
        return null;
      }),
    )
  ).filter(item => item !== null);
  if (_.isEmpty(unInstalledPackages)) {
    return;
  }
  try {
    const packageManager = await detectPackageManager(targetDir);
    const rootOfTargetDir = await getRootOfDir(targetDir);
    if (packageManager === 'yarn') {
      let command = `yarn add ${unInstalledPackages.join(' ')} --cwd ${rootOfTargetDir}`;
      if (options && options.dev) {
        command += ' --dev';
      }
      console.log(formatLogMsg('info', `Installing ${unInstalledPackages.join('\n')}`));
      await asyncExec(command);
    } else {
      let command = `npm install ${unInstalledPackages.join(' ')} --prefix ${rootOfTargetDir}`;
      if (options && options.dev) {
        command += ' --save-dev';
      }
      await asyncExec(command);
    }
    console.log(formatLogMsg('ok', `Installed ${unInstalledPackages.join('\n')}`));
  } catch (e) {
    console.log(formatLogMsg('error', `Failed to install ${unInstalledPackages.join('\n')}`));
  }
}
