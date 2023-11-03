import fs from 'fs';
import _ from 'lodash';
import { ActionResponse, AppendActionConfig } from '../types/Action';

export default async function append(actionConfig: AppendActionConfig): Promise<ActionResponse> {
  const { path: filePath, pattern, template } = actionConfig;
  try {
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        throw new Error(`Error reading file: ${err.message}`);
      }
      const updatedData = _.replace(data, pattern, `${pattern}${template}`);
      console.log({ updatedData })
      if (updatedData === data) {
        throw new Error(`Pattern ${pattern} not found in file ${filePath}`);
      }
      fs.writeFile(filePath, updatedData, 'utf8', errWriteFile => {
        if (errWriteFile) {
          throw new Error(`Error writing file: ${errWriteFile.message}`);
        }
      });
    });
    return { success: true };
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error };
    }
    throw error;
  }
}
