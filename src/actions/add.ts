import fs from 'fs';
import path from 'path';
import { ActionResponse, AddActionConfig } from '../types/Action';
import { formatLogMsg, logAction } from '../utils';

export default async function add(actionConfig: AddActionConfig): Promise<ActionResponse> {
  const { type, path: filePath, template, force, skipIfExists } = actionConfig;
  const dirPath = path.dirname(filePath);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  if (!force) {
    if (skipIfExists && fs.existsSync(filePath)) {
      console.info(formatLogMsg('info', logAction(type, `${filePath} already exists`)));
      return { success: false };
    }
  }
  fs.writeFileSync(filePath, template, 'utf8');
  return { success: true };
}
