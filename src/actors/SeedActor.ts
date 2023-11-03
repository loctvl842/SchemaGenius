import fs from 'fs';
import _ from 'lodash';
import path from 'path';
import ts from 'typescript';
import execute from '../actions';
import { SeedActorAuthor } from '../types/SeedActor';
import { asyncExec, formatLogMsg, getRootOfDir, install } from '../utils';

class SeedActor {
  static async resolveDependency(packageName: string, targetDir: string): Promise<void> {
    if (packageName === 'typeorm') {
      await install(['typeorm'], targetDir);
      await install(['typescript', 'ts-node', '@types/node'], targetDir, { dev: true });

      const rootOfTargetDir = await getRootOfDir(targetDir);
      const tsconfigPath = path.join(rootOfTargetDir, 'tsconfig.json');
      if (!fs.existsSync(tsconfigPath)) {
        await asyncExec(`cd ${rootOfTargetDir} && ./node_modules/.bin/tsc --init`);
      }

      const { config: existingConfig } = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
      const updatedConfig = _.merge(existingConfig, {
        compilerOptions: {
          emitDecoratorMetadata: true,
          experimentalDecorators: true,
          strictPropertyInitialization: false,
        },
      });
      await execute([{
        type: 'add',
        description: 'Add required options to tsconfig.json to serve "TypeORM"',
        path: tsconfigPath,
        force: true,
        template: JSON.stringify(updatedConfig, null, 2),
      }]);
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
