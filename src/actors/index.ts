import { DatabaseInfo } from '../types/Database';
import Actor from './Actor';

export async function getActions(
  format: string,
  targetDbDir: string,
  entitiesDirName: string,
  dbInfo: DatabaseInfo,
  dbmlPath: string,
) {
  return Actor.getActions(format, targetDbDir, entitiesDirName, dbInfo, dbmlPath);
}
