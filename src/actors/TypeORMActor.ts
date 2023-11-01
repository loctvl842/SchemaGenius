import { Parser } from '@dbml/core';
import { exec } from 'child_process';
import fs from 'fs';
import * as inflection from 'inflection';
import _ from 'lodash';
import path from 'path';
import { promisify } from 'util';
import { ActionType } from '../types/Action';
import {
  TypeORMActorAuthor,
  TypeORMActorDependency,
  TypeORMActorEntity,
  TypeORMActorField,
  TypeORMActorFieldLine,
  TypeORMActorImportCommand,
  TypeORMColumnDecoratorType,
  TypeORMRelationDecoratorType,
} from '../types/TypeORMActor';
import { IDatabase, ISchema } from '../types/dbml';
import { formatLogMsg, pgTypeToTsType } from '../utils';

class TypeORMActor {
  static getFieldArr(
    tableId: number,
    model: IDatabase,
  ): { fields: TypeORMActorField[]; dependencies: TypeORMActorDependency[] } {
    const table = model.tables[tableId];

    const dependencies: TypeORMActorDependency[] = [];
    const fields = table.fieldIds.map((fieldId: number) => {
      const field = model.fields[fieldId];

      // helper
      const getColumnDecoratorStr = (columnDecorator: TypeORMColumnDecoratorType, columnOptions: string) => {
        const dependency: TypeORMActorDependency = {
          type: 'named',
          name: columnDecorator,
          source: 'typeorm',
          level: 0,
        };

        if (!_.some(dependencies, item => _.isEqual(item, dependency))) {
          dependencies.push(dependency);
        }
        return `@${columnDecorator}(${columnOptions ? `{ ${columnOptions} }` : ''})`;
      };

      const lines: TypeORMActorFieldLine[] = [];
      const columnOptions: string[] = [];
      let columnDecorator: TypeORMColumnDecoratorType = 'Column';
      let fieldTypeName: string = field.type.type_name;

      columnOptions.push(`name: '${field.name}'`);

      const generatedStr = (type: 'identity' | 'uuid' | 'rowid' | 'increment') => `generated: '${type}'`;
      if (field.increment) {
        const typicalIntergers = new Set(['BIGINT', 'INT', 'INTEGER', 'SMALLINT']);
        const incrementIntergers = new Set(['SMALLSERIAL', 'SERIAL', 'BIGSERIAL']);
        const typeRaw = field.type.type_name.toUpperCase();

        // TODO: test this again
        if (typicalIntergers.has(typeRaw)) {
          columnOptions.push(`type: '${field.type.type_name}'`);
          columnOptions.push(generatedStr('identity'));
        } else if (incrementIntergers.has(typeRaw)) {
          columnOptions.push(`type: '${field.type.type_name}'`);
        }
      } else {
        if (!_.isEmpty(field.type.args)) {
          fieldTypeName = _.replace(fieldTypeName, `(${field.type.args})`, '');
        }
        columnOptions.push(`type: '${fieldTypeName}'`);
        if (fieldTypeName === 'decimal') {
          const typeArgs: string[] = field.type.args.split(',');
          columnOptions.push(`precision: ${_.parseInt(typeArgs[0])}`);
          columnOptions.push(`scale: ${_.parseInt(typeArgs[1])}`);
        }
      }
      if (field.unique) {
        columnOptions.push(`unique: ${field.unique ? 'true' : 'false'}`);
      }

      if (field.pk) {
        if (field.type.type_name === 'uuid') {
          columnOptions.push(generatedStr('uuid'));
        }

        columnDecorator = 'PrimaryColumn';
      }

      if (!field.pk) {
        columnOptions.push(`nullable: ${field.not_null ? 'false' : 'true'}`);
      }

      if (field.dbdefault) {
        if (field.dbdefault.type === 'expression') {
          columnOptions.push(`default: '${field.dbdefault.value}'`);
        } else if (field.dbdefault.type === 'string') {
          columnOptions.push(`default: '${field.dbdefault.value}'`);
        } else {
          columnOptions.push(`default: ${field.dbdefault.value}`);
        }
      }

      const decoratorStr = getColumnDecoratorStr(columnDecorator, columnOptions.join(', '));
      lines.push(decoratorStr);
      lines.push(`${inflection.camelize(field.name, true)}: ${pgTypeToTsType(fieldTypeName)}`);

      return lines;
    });

    return { fields, dependencies };
  }

  static async getSourceEntityArr(tableIds: number[], model: IDatabase): Promise<TypeORMActorEntity[]> {
    const entityArr = tableIds.map((tableId: number) => {
      const table = model.tables[tableId];
      const entityName = inflection.camelize(inflection.singularize(table.name));
      const { fields: classContent, dependencies } = TypeORMActor.getFieldArr(tableId, model);
      return {
        tableId,
        entityName,
        classContent,
        dependencies,
      };
    });
    return entityArr;
  }

  static async getMapperEntityArr(
    refIds: number[],
    model: IDatabase,
    mapperEntityArr: TypeORMActorEntity[],
  ): Promise<TypeORMActorEntity[]> {
    refIds.forEach((refId: number) => {
      const ref = model.refs[refId];
      const refOneIndex = ref.endpointIds.findIndex(
        (endpointId: number) => model.endpoints[endpointId].relation === '1',
      );
      const refEndpointIndex = refOneIndex === -1 ? 0 : refOneIndex;
      const foreignEndpointId = ref.endpointIds[1 - refEndpointIndex];
      const refEndpointId = ref.endpointIds[refEndpointIndex];

      const foreignEndpoint = model.endpoints[foreignEndpointId];
      const refEndpoint = model.endpoints[refEndpointId];

      const refEndpointField = model.fields[refEndpoint.fieldIds[0]];
      const refEntity = _.find(mapperEntityArr, {
        tableId: refEndpointField.tableId,
      });
      if (!refEntity) {
        return;
      }

      const foreignEndpointField = model.fields[foreignEndpoint.fieldIds[0]];
      const foreignEntity = _.find(mapperEntityArr, {
        tableId: foreignEndpointField.tableId,
      });
      if (!foreignEntity) {
        return;
      }

      let foreignRelationshipType: TypeORMRelationDecoratorType = 'OneToOne';
      let refRelationshipType: TypeORMRelationDecoratorType = 'OneToOne';
      let foreignRelationshipName = '';
      let refRelationshipName = '';
      const foreignRelationshipOptions: string[] = [];
      const refRelationshipOptions: string[] = [];

      foreignRelationshipOptions.push(`'${refEntity.entityName}'`);
      refRelationshipOptions.push(`'${foreignEntity.entityName}'`);

      if (foreignEndpoint.relation === '1' && refEndpoint.relation === '1') {
        // decorator type
        foreignRelationshipType = 'OneToOne';
        refRelationshipType = 'OneToOne';

        // field name
        foreignRelationshipName = inflection.singularize(inflection.camelize(refEntity.entityName, true));
        refRelationshipName = inflection.singularize(inflection.camelize(foreignEntity.entityName, true));
      } else if (foreignEndpoint.relation === '*' && refEndpoint.relation === '1') {
        // decorator type
        foreignRelationshipType = 'ManyToOne';
        refRelationshipType = 'OneToMany';

        // field name
        foreignRelationshipName = inflection.singularize(inflection.camelize(refEntity.entityName, true));
        refRelationshipName = inflection.pluralize(inflection.camelize(foreignEntity.entityName, true));
      } else if (foreignEndpoint.relation === '1' && refEndpoint.relation === '*') {
        // decorator type
        foreignRelationshipType = 'OneToMany';
        refRelationshipType = 'ManyToOne';

        // field name
        foreignRelationshipName = inflection.pluralize(inflection.camelize(refEntity.entityName, true));
        refRelationshipName = inflection.singularize(inflection.camelize(foreignEntity.entityName, true));
      } else {
        // many to many relationship
      }

      // TODO: More options here
      // eslint-disable-next-line no-constant-condition
      if (true) {
        foreignRelationshipName = `${foreignRelationshipName}${inflection.camelize(foreignEndpointField.name)}`;
        refRelationshipName = `${refRelationshipName}${inflection.camelize(foreignEndpointField.name)}`;
      }

      // dependencies
      foreignEntity.dependencies.push(
        {
          type: 'named',
          name: foreignRelationshipType,
          source: 'typeorm',
          level: 0,
        },
        {
          type: 'named',
          name: 'Relation',
          source: 'typeorm',
          level: 0,
        },
        {
          type: 'default',
          name: `type ${refEntity.entityName}`,
          source: `./${refEntity.entityName}`,
          level: 1,
        },
      );
      refEntity.dependencies.push(
        {
          type: 'named',
          name: refRelationshipType,
          source: 'typeorm',
          level: 0,
        },
        {
          type: 'named',
          name: 'Relation',
          source: 'typeorm',
          level: 0,
        },
        {
          type: 'default',
          name: `type ${foreignEntity.entityName}`,
          source: `./${foreignEntity.entityName}`,
          level: 1,
        },
      );

      foreignRelationshipOptions.push(`'${refRelationshipName}'`);
      refRelationshipOptions.push(`'${foreignRelationshipName}'`);

      /*
       * Add JoinColumn
       * @JoinColumn must be set only on one side of relation
       * (the side that must have the foreign key in the database table.)
       * Ref: https://typeorm.io/one-to-one-relations
       */
      const joinColumnDecoratorOptions: string[] = [];

      joinColumnDecoratorOptions.push(`name: '${foreignEndpointField.name}'`);
      joinColumnDecoratorOptions.push(`referencedColumnName: '${refEndpointField.name}'`);
      joinColumnDecoratorOptions.push(
        `foreignKeyConstraintName: 'FK_${foreignEntity.entityName}_${foreignEndpointField.name}_${refEntity.entityName}_${refEndpointField.name}'`,
      );

      const joinColumnDecoratorStr = `@JoinColumn(${
        !_.isEmpty(joinColumnDecoratorOptions) ? `{ ${joinColumnDecoratorOptions.join(', ')} }` : ''
      })`;
      foreignEntity.dependencies.push({
        type: 'named',
        name: 'JoinColumn',
        source: 'typeorm',
        level: 0,
      });

      const foreignRelationshipField: TypeORMActorField = [];
      const refRelationshipField: TypeORMActorField = [];

      // TODO: custom foreign keys here for multiple references to same table
      // Take prospero.dbml as an example

      const foreignRelationshipDecoratorStr = `@${foreignRelationshipType}(${foreignRelationshipOptions.join(', ')})`;
      foreignRelationshipField.push(foreignRelationshipDecoratorStr);
      foreignRelationshipField.push(joinColumnDecoratorStr);
      foreignRelationshipField.push(`${foreignRelationshipName}: Relation<${refEntity.entityName}>`);

      const refRelationshipDecoratorStr = `@${refRelationshipType}(${refRelationshipOptions.join(', ')})`;
      refRelationshipField.push(refRelationshipDecoratorStr);
      refRelationshipField.push(`${refRelationshipName}: Relation<${foreignEntity.entityName}>`);

      foreignEntity.classContent.push(foreignRelationshipField);
      refEntity.classContent.push(refRelationshipField);
    });
    return mapperEntityArr;
  }

  static async getDependenciesStr(dependencies: TypeORMActorDependency[]): Promise<string> {
    const uniqDependencies = _.uniqWith([...dependencies], _.isEqual);
    const importCommands: TypeORMActorImportCommand[] = Object.entries(_.groupBy(uniqDependencies, 'source')).map(
      ([source, groupedDeps]: [string, TypeORMActorDependency[]]): TypeORMActorImportCommand => {
        const { level } = groupedDeps[0];
        const depsByType = _.groupBy(groupedDeps, 'type');
        const namedDeps = depsByType.named || [];
        const defaultDeps = depsByType.default || [];

        const depsStr = [...defaultDeps.map(dep => dep.name)];
        if (!_.isEmpty(namedDeps)) {
          depsStr.push(`{ ${namedDeps.map(dep => dep.name).join(', ')} }`);
        }

        return {
          dependencyStr: `import ${depsStr.join(', ')} from '${source}'`,
          source,
          level,
        };
      },
    );

    // import packages with small level first, then organize imports by source name
    const sortedImportCommands = _.sortBy(importCommands, ['level', 'source']);
    const dependenciesStr = sortedImportCommands.map(command => command.dependencyStr).join('\n');
    return dependenciesStr;
  }

  static async getAuthorInfo(): Promise<TypeORMActorAuthor> {
    const asyncExec = promisify(exec);
    try {
      const { stdout: name } = await asyncExec('git config user.name');
      const { stdout: email } = await asyncExec('git config user.email');
      return { name: name.trim(), email: email.trim() };
    } catch (e) {
      console.log(formatLogMsg('warn', 'Failed to get author info'));
      return { name: 'unknwon', email: 'unknwon' };
    }
  }

  static getWarningMsg(entity: TypeORMActorEntity, author: TypeORMActorAuthor): string {
    const now = new Date();
    const formattedDate = now.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    });
    return `/**
 * AUTO-GENERATED CODE - DO NOT MODIFY
 *
 * This file, 'I${entity.entityName}.ts', is generated automatically from the source database schema (DBML).
 * It defines the database table structure and is meant to be kept consistent with the database schema.
 * Any changes to the table structure should be made in the original DBML source and then regenerated.
 *
 * Generated on: ${formattedDate}
 * Author: ${author.name} - ${author.email}
 *
 * To define TypeORM-specific configurations or relationships for the 'Movie' entity, please refer to 'Movie.ts'.
 */

`;
  }

  static checkFileChanged(filePath: string, entity: TypeORMActorEntity, content: string): boolean {
    if (!fs.existsSync(filePath)) {
      return true;
    }
    const existingContent: string = fs.readFileSync(filePath, 'utf8');

    if (existingContent.includes(content)) {
      return false;
    }
    return true;
  }

  static async getActionsAddEntity(schema: ISchema, model: IDatabase, targetDir: string): Promise<ActionType[]> {
    const mapperDir = targetDir;
    const mapperFolderName = path.basename(mapperDir);
    const sourceFolderName = `__${mapperFolderName}__`;
    const sourceDir = path.resolve(path.dirname(mapperDir), sourceFolderName);
    const author = await TypeORMActor.getAuthorInfo();

    const { tableIds, refIds } = schema;

    let sourceEntityArr: TypeORMActorEntity[] = [];
    let mapperEntityArr: TypeORMActorEntity[] = [];
    const actions: ActionType[] = [];

    if (!_.isEmpty(tableIds)) {
      sourceEntityArr = [...(await TypeORMActor.getSourceEntityArr(tableIds, model))];
      mapperEntityArr = sourceEntityArr.map(entity => ({
        ...entity,
        classContent: [],
        dependencies: [],
      }));
    }

    if (!_.isEmpty(refIds)) {
      mapperEntityArr = [...(await TypeORMActor.getMapperEntityArr(refIds, model, mapperEntityArr))];
    }

    const actionsGenerateSourceEntities: ActionType[] = await Promise.all(
      sourceEntityArr.map(async entity => {
        const { entityName, dependencies, classContent } = entity;
        const classContentStr: string = `${classContent
          .map((field: TypeORMActorField) => `  ${field.join('\n  ')}`)
          .join('\n\n')}`;
        const classDefinitionStr: string = `abstract class I${entityName} {\n${classContentStr}\n}\n\nexport default I${entityName};`;

        const dependenciesStr: string = await TypeORMActor.getDependenciesStr(dependencies);
        const warningMsg: string = TypeORMActor.getWarningMsg(entity, author);

        const entityStr: string = `${warningMsg}${dependenciesStr}\n\n${classDefinitionStr}`;

        const filePath: string = `${sourceDir}/I${entityName}.ts`;

        // No need to check warningMsg
        const entityContentStr = entityStr.substring(warningMsg.length);
        if (!TypeORMActor.checkFileChanged(filePath, entity, entityContentStr)) {
          return `Nothing changed in file ${entityName}.ts`;
        }

        return {
          type: 'add',
          path: filePath,
          template: entityStr,
          force: true,
        };
      }),
    );
    actions.push(...actionsGenerateSourceEntities);

    const actionsGenerateMapperEntities: ActionType[] = await Promise.all(
      mapperEntityArr.map(async entity => {
        const { tableId, entityName, dependencies, classContent } = entity;
        const table = model.tables[tableId];

        const entityDecoratorStr: string = `@Entity({ name: '${table.name}' })`;
        dependencies.push({
          type: 'named',
          name: 'Entity',
          source: 'typeorm',
          level: 0,
        });
        const classContentStr: string = `${classContent
          .map((field: TypeORMActorField) => `  ${field.join('\n  ')}`)
          .join('\n\n')}`;
        const sourceClassName: string = `I${entityName}`;
        const classDefinitionStr: string = `class ${entityName} extends ${sourceClassName} {\n${classContentStr}\n}\n\nexport default ${entityName};`;
        dependencies.push({
          type: 'default',
          name: sourceClassName,
          source: `../${sourceFolderName}/I${entityName}`,
          level: 1,
        });

        const dependenciesStr: string = await TypeORMActor.getDependenciesStr(dependencies);
        const entityStr: string = `${dependenciesStr}\n\n${entityDecoratorStr}\n${classDefinitionStr}`;

        return {
          type: 'add',
          path: `${mapperDir}/${entityName}.ts`,
          template: entityStr,
          skipIfExists: true,
        };
      }),
    );
    actions.push(...actionsGenerateMapperEntities);

    return actions;
  }

  static extractModel(schemaPath: string): IDatabase {
    const dbml = fs.readFileSync(schemaPath, 'utf-8');
    const database = Parser.parse(dbml, 'dbml');
    const model = database.normalize();
    return model;
  }

  static getDataSourceConfig() {
    const dependencies: TypeORMActorDependency[] = [];
    const configStr = `import { DatabaseConfig } from '@src/interfaces/app/configuration';
import dotenv from 'dotenv';
import { resolve } from 'path';
import 'reflect-metadata';
import { DataSource } from 'typeorm';

dotenv.config();

const { env } = process;

const dbConfig: DatabaseConfig = {
  dbHost: env.POSTGRES_HOST || 'localhost',
  dbPort: env.POSTGRES_PORT || 5432,
  dbName: env.POSTGRES_DB || 'postgres',
  dbUser: env.POSTGRES_USER || 'postgres',
  dbPass: env.POSTGRES_PASSWORD || 'postgres',
};

const entityPath = resolve(__dirname, 'entities');
const migrationsPath = resolve(__dirname, 'migrations');

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: dbConfig.dbHost,
  port: dbConfig.dbPort,
  username: dbConfig.dbUser,
  password: dbConfig.dbPass,
  database: dbConfig.dbName,
  entities: [\`\${entityPath}/**/*{.ts,.js}\`],
  migrations: [\`\${migrationsPath}/**/*.ts\`],
  migrationsTableName: 'history'
});`;
    dependencies.push({
      type: 'default',
      name: 'dotenv',
      source: 'dotenv',
      level: 0,
    });
    return { configStr, dependencies };
  }

  static async getActions(targetDirPath: string, dbmlPath: string): Promise<ActionType[]> {
    const model = this.extractModel(dbmlPath);
    const database = model.database[1];
    const actions: ActionType[] = await database.schemaIds.reduce(
      async (promisePrevActions: Promise<ActionType[]>, schemaId: number) => {
        const schema = model.schemas[schemaId];
        const prevActions = await promisePrevActions;
        prevActions.push(...(await TypeORMActor.getActionsAddEntity(schema, model, targetDirPath)));
        return prevActions;
      },
      Promise.resolve([]),
    );

    return actions;
  }
}

export default TypeORMActor;
