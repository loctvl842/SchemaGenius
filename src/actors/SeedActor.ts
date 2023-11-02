import fs from 'fs';
import _ from 'lodash';
import path from 'path';
import ts from 'typescript';
import execute from '../actions';
import { ActionType } from '../types/Action';
import { SeedActorAuthor } from '../types/SeedActor';
import { asyncExec, formatLogMsg, getRootOfDir, install } from '../utils';

class SeedActor {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static getActionsEditTsConfig(tsconfigPath: string, compilerOption: string, value: any): ActionType {
    const { config: existingConfig } = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    if (Object.hasOwnProperty.call(existingConfig.compilerOptions, compilerOption)) {
      return {
        type: 'replace',
        pattern: new RegExp(`"${compilerOption}"\\s*:\\s*(true|false|\\d+|".*")`, 'g'),
        path: tsconfigPath,
        template: `"${compilerOption}": ${value}`,
      };
    }
    return {
      type: 'append',
      pattern: '"compilerOptions": {',
      path: tsconfigPath,
      template: `\n    "${compilerOption}": ${value},`,
    };
  }

  static async resolveDependency(packageName: string, targetDir: string): Promise<void> {
    if (packageName === 'typeorm') {
      await install(['typeorm'], targetDir);
      await install(['typescript', '@types/node'], targetDir, { dev: true });

      const rootOfTargetDir = await getRootOfDir(targetDir);
      const tsconfigPath = path.join(rootOfTargetDir, 'tsconfig.json');
      if (!fs.existsSync(tsconfigPath)) {
        await asyncExec(`cd ${rootOfTargetDir} && ./node_modules/.bin/tsc --init`);
      }

      const actionsTsConfig: ActionType[] = [];
      actionsTsConfig.push(SeedActor.getActionsEditTsConfig(tsconfigPath, 'emitDecoratorMetadata', true));
      actionsTsConfig.push(SeedActor.getActionsEditTsConfig(tsconfigPath, 'experimentalDecorators', true));
      actionsTsConfig.push(SeedActor.getActionsEditTsConfig(tsconfigPath, 'strictPropertyInitialization', false));
      execute(actionsTsConfig);
    } else {
      await install([packageName], targetDir);
    }
  }

  static async getAuthorInfo(): Promise<SeedActorAuthor> {
    try {
      const { stdout: name } = await asyncExec('git config user.name');
      const { stdout: email } = await asyncExec('git config user.email');
      return { name: name.trim(), email: email.trim() };
    } catch (e) {
      console.log(formatLogMsg('warn', 'Failed to get author info'));
      return { name: 'unknwon', email: 'unknwon' };
    }
  }
}

export default SeedActor;
