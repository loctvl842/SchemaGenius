import fs from 'fs';
import _ from 'lodash';
import { ReplaceActionConfig } from '../types/Action';
import { formatLogMsg, logAction } from '../utils';

export default async function replace(actionConfig: ReplaceActionConfig): Promise<void> {
  const { type, path: filePath, pattern, template } = actionConfig;
  try {
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        throw new Error(`Error reading file: ${err.message}`);
      }
      const updatedData = _.replace(data, pattern, template);
      if (updatedData === data) {
        throw new Error(`Pattern ${pattern} not found in file ${filePath}`);
      }
      fs.writeFile(filePath, updatedData, 'utf8', errWriteFile => {
        if (errWriteFile) {
          throw new Error(`Error writing file: ${errWriteFile.message}`);
        }
        console.info(formatLogMsg('ok', logAction(type, filePath)));
      });
    });
  } catch (e) {
    console.error(formatLogMsg('error', `Error replacing text to file ${filePath}:\n ${e}`));
  }
}
