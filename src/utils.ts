import chalk from 'chalk';

export function pgTypeToTsType(columnType: string) {
  switch (columnType) {
    case 'bpchar':
    case 'char':
    case 'varchar':
    case 'text':
    case 'citext':
    case 'uuid':
    case 'bytea':
    case 'inet':
    case 'time':
    case 'timetz':
    case 'interval':
    case 'name':
      return 'string';
    case 'int':
    case 'decimal':
    case 'int2':
    case 'int4':
    case 'int8':
    case 'float4':
    case 'float8':
    case 'numeric':
    case 'money':
    case 'oid':
      return 'number';
    case 'bool':
      return 'boolean';
    case 'json':
    case 'jsonb':
      return 'Json';
    case 'date':
    case 'timestamp':
    case 'timestamptz':
      return 'Date';
    case '_int2':
    case '_int4':
    case '_int8':
    case '_float4':
    case '_float8':
    case '_numeric':
    case '_money':
      return 'number[]';
    case '_bool':
      return 'boolean[]';
    case '_varchar':
    case '_text':
    case '_citext':
    case '_uuid':
    case '_bytea':
      return 'string[]';
    case '_json':
    case '_jsonb':
      return 'Json[]';
    case '_timestamptz':
      return 'Date[]';
    default:
      return 'any';
  }
}

export function logAction(type: string, msg: string) {
  return `[${type.toUpperCase()}] ${msg}`;
}

export function formatLogMsg(status: 'info' | 'error' | 'warn' | 'ok', message: string, title?: string): string {
  let formatStatusBg;
  switch (status.toLowerCase()) {
    case 'info':
      formatStatusBg = chalk.hex('#221f22').bold.bgHex('#78dce8');
      break;
    case 'error':
      formatStatusBg = chalk.hex('#221f22').bold.bgHex('#ff6188');
      break;
    case 'warn':
      formatStatusBg = chalk.hex('#221f22').bold.bgHex('#fc9867');
      break;
    case 'ok':
      formatStatusBg = chalk.hex('#221f22').bold.bgHex('#a9dc76');
      break;
    default:
      throw new Error(`Unknown status: ${status}`);
  }
  const formatStatus = `${formatStatusBg(` ${status.toUpperCase()} `)}`;
  const formatTitle = title ? `${chalk.bold.white(title)}:\n` : '';
  return `${formatStatus} ${formatTitle}${message}`;
}
