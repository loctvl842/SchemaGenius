import { ActionType } from '../types/Action';
import TypeORMActor from './TypeORMActor';

class Actor {
  static async getActions(format: string, targetDirPath: string, dbmlPath: string): Promise<ActionType[]> {
    let actions: ActionType[] = [];
    switch (format) {
      case 'TypeORM':
        actions = [...(await TypeORMActor.getActions(targetDirPath, dbmlPath))];
        break;
      default:
        break;
    }
    return actions;
  }
}

export default Actor;
