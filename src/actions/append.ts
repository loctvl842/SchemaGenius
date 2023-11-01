import fs from 'fs';
import _ from 'lodash';
import { AppendActionConfig } from '../types/Action';
import { formatLogMsg, logAction } from '../utils';

export default async function append(actionConfig: AppendActionConfig): Promise<void> {
  const { path: filePath, pattern, template } = actionConfig;
  try {
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        throw new Error(`Error reading file: ${err.message}`);
      }
      const updatedData = _.replace(data, pattern, `${template}${pattern}`);
      if (updatedData === data) {
        throw new Error(`Pattern ${pattern} not found in file ${filePath}`);
      }
      fs.writeFile(filePath, updatedData, 'utf8', errWriteFile => {
        if (errWriteFile) {
          throw new Error(`Error writing file: ${errWriteFile.message}`);
        }
        console.info(formatLogMsg('ok', logAction('append', filePath)));
      });
    });
  } catch (e) {
    console.error(formatLogMsg('error', `Error appending text to file ${filePath}:\n ${e}`));
  }
}
