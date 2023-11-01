import TypeORMActor from '../actors/TypeORMActor';
import { ActionType } from './Action';

export interface ActorOptions {
  targetDirPath: string;
  dbmlPath: string;
}

export abstract class Actor {
  static async getActions(targetDirPath: string, dbmlPath: string): Promise<ActionType[]> {
    throw new Error('Method not implemented');
  }
}

export type ActorType = TypeORMActor;
