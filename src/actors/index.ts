import Actor from './Actor';

export async function getActions(format: string, targetDirPath: string, dbmlPath: string) {
  return Actor.getActions(format, targetDirPath, dbmlPath);
}
