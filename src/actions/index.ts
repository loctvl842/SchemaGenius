import {
  ActionConfig,
  ActionResponse,
  ActionType,
  AddActionConfig,
  AppendActionConfig,
  ReplaceActionConfig,
} from '../types/Action';
import { formatLogMsg, logAction } from '../utils';
import add from './add';
import append from './append';
import replace from './replace';

type ActionTypeHandler = (config: ActionConfig) => Promise<ActionResponse>;

const ActionHandler: Record<string, ActionTypeHandler> = {
  add: async (config: ActionConfig) => {
    const res = await add(config as AddActionConfig);
    return res;
  },
  append: async (config: ActionConfig) => {
    const res = await append(config as AppendActionConfig);
    return res;
  },
  replace: async (config: ActionConfig) => {
    const res = await replace(config as ReplaceActionConfig);
    return res;
  },
};

export default async function execute(actions: ActionType[]) {
  await Promise.all(
    actions.map(async actionConfig => {
      if (typeof actionConfig === 'string') {
        console.info(formatLogMsg('info', actionConfig));
        return;
      }
      const { type, skip, description } = actionConfig;
      if (skip && skip()) {
        return;
      }
      const actionHandler = ActionHandler[type];
      if (!actionHandler) {
        console.error(formatLogMsg('error', `Unknown action type ${actionConfig.type}`));
        return;
      }
      try {
        const { success, error } = await actionHandler(actionConfig);
        if (error) {
          console.error(formatLogMsg('error', error.message));
          return;
        }
        if (!success) {
          return;
        }
        console.info(formatLogMsg('info', logAction(type, description)));
      } catch (e) {
        console.error(formatLogMsg('error', `Internal error: ${e}`));
      }
    }),
  );
}
