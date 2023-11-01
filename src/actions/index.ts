import { ActionConfig, ActionType, AddActionConfig, AppendActionConfig } from '../types/Action';
import { formatLogMsg } from '../utils';
import add from './add';
import append from './append';

type ActionTypeHandler = (config: ActionConfig) => void;

const ActionHandler: Record<string, ActionTypeHandler> = {
  add: (config: ActionConfig) => add(config as AddActionConfig),
  append: (config: ActionConfig) => append(config as AppendActionConfig),
};

export default function execute(actions: ActionType[]) {
  actions.forEach(actionConfig => {
    if (typeof actionConfig === 'string') {
      console.log(formatLogMsg('info', actionConfig));
    } else {
      const actionHandler = ActionHandler[actionConfig.type];
      if (actionHandler) {
        actionHandler(actionConfig);
      } else {
        console.error(formatLogMsg('error', `Unknown action type ${actionConfig.type}`));
      }
    }
  });
}
