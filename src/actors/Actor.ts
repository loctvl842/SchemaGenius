import { Parser } from '@dbml/core';
import fs from 'fs';
import { ActionType } from '../types/Action';
import { DatabaseInfo } from '../types/Database';
import { IDatabase } from '../types/dbml';
import TypeORMActor from './TypeORMActor';
import SeedActor from './SeedActor';

class Actor {
  static extractModel(schemaPath: string): IDatabase {
    const dbml = fs.readFileSync(schemaPath, 'utf-8');
    const database = Parser.parse(dbml, 'dbml');
    const model = database.normalize();
    return model;
  }

  static async getActions(
    format: string,
    targetDbDir: string,
    entitiesDirName: string,
    dbInfo: DatabaseInfo,
    dbmlPath: string,
  ): Promise<ActionType[]> {
    const model = Actor.extractModel(dbmlPath);

    let actions: ActionType[] = [];
    let requiredPackages: string[] = [];
    switch (format) {
      case 'TypeORM':
        actions = [...(await TypeORMActor.getActions(targetDbDir, entitiesDirName, dbInfo, model))];
        requiredPackages = TypeORMActor.requiredPackages;
        break;
      default:
        break;
    }

    // resolve all dependencies
    await Promise.all(
      requiredPackages.map(async (pkg: string) => {
        await SeedActor.resolveDependency(pkg, targetDbDir);
      }),
    );
    return actions;
  }
}

export default Actor;
