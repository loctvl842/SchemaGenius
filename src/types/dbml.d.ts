/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ISchema {
  id: number;
  name: string;
  note: string;
  alias: string;
  tableIds: number[];
  enumIds: number[];
  tableGroupIds: number[];
  refIds: number[];
  databaseId: number;
}

export interface IRef {
  id: number;
  endpointIds: number[];
  schemaId: number;
}

export interface IEnum {
  id: number;
  name: string;
  note: string;
  valueIds: number[];
  fieldIds: number[];
  schemaId: number;
}

export interface ITableGroup {
  id: number;
  name: string;
  tableIds: number[];
  schemaId: number;
}

export interface ITable {
  id: number;
  name: string;
  alias: string;
  note: string;
  headerColor: string;
  fieldIds: number[];
  indexIds: number[];
  schemaId: number;
  groupId: number;
}

export interface IEndpoint {
  id: number;
  schemaName: string;
  tableName: string;
  fieldNames: string[];
  relation: any;
  refId: number;
  fieldIds: number[];
}

export interface IEnumValue {
  id: number;
  name: string;
  note: string;
  enumId: number;
}

export interface IIndex {
  id: number;
  name: string;
  type: any;
  unique: boolean;
  pk: string;
  note: string;
  columnIds: number[];
  tableId: number;
}

export interface IIndexColumn {
  id: number;
  type: any;
  value: any;
  indexId: number;
}

export interface IField {
  id: number;
  name: string;
  type: any;
  unique: boolean;
  pk: boolean;
  not_null: boolean;
  note: string;
  dbdefault: any;
  increment: boolean;
  tableId: number;
  endpointIds: number[];
  enumId: number;
}

export interface IDatabase {
  database: {
    [_id: number]: {
      id: number;
      hasDefaultSchema: boolean;
      note: string;
      databaseType: string;
      name: string;
      schemaIds: number[];
    };
  };
  schemas: {
    [_id: number]: ISchema;
  };
  refs: {
    [_id: number]: IRef;
  };
  enums: {
    [_id: number]: IEnum;
  };
  tableGroups: {
    [_id: number]: ITableGroup;
  };
  tables: {
    [_id: number]: ITable;
  };
  endpoints: {
    [_id: number]: IEndpoint;
  };
  enumValues: {
    [_id: number]: IEnumValue;
  };
  indexes: {
    [_id: number]: IIndex;
  };
  indexColumns: {
    [_id: number]: IIndexColumn;
  };
  fields: {
    [_id: number]: IField;
  };
}
