import fs from 'fs';
import path from 'path';
import { AddActionConfig } from '../types/Action';
import { formatLogMsg, logAction } from '../utils';

export default async function add(actionConfig: AddActionConfig): Promise<void> {
  const { path: filePath, template, force, skipIfExists, skip } = actionConfig;
  try {
    if (skip && skip()) {
      return;
    }
    const dirPath = path.dirname(filePath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    if (!force) {
      if (skipIfExists && fs.existsSync(filePath)) {
        return;
      }
    }
    console.info(formatLogMsg('ok', logAction('add', filePath)));
    fs.writeFileSync(filePath, template, 'utf8');
  } catch (e) {
    console.error(formatLogMsg('error', `Error appending text to file ${filePath}:\n ${e}`));
  }
}
