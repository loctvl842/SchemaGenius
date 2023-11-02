import { Parser } from '@dbml/core';
import fs from 'fs';
import * as inflection from 'inflection';
import _ from 'lodash';
import path from 'path';
import ts from 'typescript';
import execute from '../../actions';
import { ActionType } from '../../types/Action';
import {
  TypeORMActorAuthor,
  TypeORMActorDependency,
  TypeORMActorEntity,
  TypeORMActorField,
  TypeORMActorFieldLine,
  TypeORMActorImportCommand,
  TypeORMColumnDecoratorType,
  TypeORMRelationDecoratorType,
} from '../../types/TypeORMActor';
import { IDatabase, ISchema } from '../../types/dbml';
import { asyncExec, formatLogMsg, getRootOfDir, install, pgTypeToTsType } from '../../utils';

class TypeORMActor {
  /*
   * Defines the prefix used for entity names.
   * For example, 'Ab' is the marker indicating an abstract class;
   * therefore, 'AbMovie' signifies an abstract entity representing movies.
   */
  static prefixEntity = 'Core';

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
          typeSource: 'external',
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
          typeSource: 'external',
        },
        {
          type: 'named',
          name: 'Relation',
          source: 'typeorm',
          level: 0,
          typeSource: 'external',
        },
        {
          type: 'default',
          name: `type ${refEntity.entityName}`,
          source: `./${refEntity.entityName}`,
          level: 1,
          typeSource: 'internal',
        },
      );
      refEntity.dependencies.push(
        {
          type: 'named',
          name: refRelationshipType,
          source: 'typeorm',
          level: 0,
          typeSource: 'external',
        },
        {
          type: 'named',
          name: 'Relation',
          source: 'typeorm',
          level: 0,
          typeSource: 'external',
        },
        {
          type: 'default',
          name: `type ${foreignEntity.entityName}`,
          source: `./${foreignEntity.entityName}`,
          level: 1,
          typeSource: 'internal',
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
        typeSource: 'external',
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

  static async resolveDependency(packageName: string, targetDir: string): Promise<void> {
    if (packageName === 'typeorm') {
      await install(['typeorm', 'pg'], targetDir);
      await install(['@types/node'], targetDir, { dev: true });

      const rootOfTargetDir = await getRootOfDir(targetDir);
      const tsconfigPath = path.join(rootOfTargetDir, 'tsconfig.json');
      const { config: existingConfig } = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
      const actionsTsConfig: ActionType[] = [];
      if (Object.hasOwnProperty.call(existingConfig.compilerOptions, 'emitDecoratorMetadata')) {
        actionsTsConfig.push({
          type: 'replace',
          pattern: /"emitDecoratorMetadata":\s*(true|false)/g,
          path: tsconfigPath,
          template: '"emitDecoratorMetadata": true',
        });
      } else {
        actionsTsConfig.push({
          type: 'append',
          pattern: '"compilerOptions": {',
          path: tsconfigPath,
          template: '\n    "emitDecoratorMetadata": true,',
        });
      }
      if (Object.hasOwnProperty.call(existingConfig.compilerOptions, 'experimentalDecorators')) {
        actionsTsConfig.push({
          type: 'replace',
          pattern: /"experimentalDecorators":\s*(true|false)/g,
          path: tsconfigPath,
          template: '"experimentalDecorators": true',
        });
      } else {
        actionsTsConfig.push({
          type: 'append',
          pattern: '"compilerOptions": {',
          path: tsconfigPath,
          template: '\n    "experimentalDecorators": true,',
        });
      }
      execute(actionsTsConfig);
    } else {
      await install([packageName], targetDir);
    }
  }

  static async getDependenciesStr(dependencies: TypeORMActorDependency[], targetDir: string): Promise<string> {
    const uniqDependencies = _.uniqWith([...dependencies], _.isEqual);
    const uniqDependenciesBySource = Object.entries(_.groupBy(uniqDependencies, 'source'));
    const importCommands: TypeORMActorImportCommand[] = await Promise.all(
      uniqDependenciesBySource.map(
        async ([source, groupedDeps]: [string, TypeORMActorDependency[]]): Promise<TypeORMActorImportCommand> => {
          const { level, typeSource } = groupedDeps[0];
          if (typeSource === 'external') {
            await TypeORMActor.resolveDependency(source, targetDir);
          }
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
      ),
    );

    // import packages with small level first, then organize imports by source name
    const sortedImportCommands = _.sortBy(importCommands, ['level', 'source']);
    const dependenciesStr = sortedImportCommands.map(command => command.dependencyStr).join('\n');
    return dependenciesStr;
  }

  static async getAuthorInfo(): Promise<TypeORMActorAuthor> {
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
 * This file, '${TypeORMActor.prefixEntity}${entity.entityName}.ts', is generated automatically from the source database schema (DBML).
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
        const classDefinitionStr: string = `abstract class ${TypeORMActor.prefixEntity}${entityName} {\n${classContentStr}\n}\n\nexport default ${TypeORMActor.prefixEntity}${entityName};`;

        const dependenciesStr: string = await TypeORMActor.getDependenciesStr(dependencies, targetDir);
        const warningMsg: string = TypeORMActor.getWarningMsg(entity, author);

        const entityStr: string = `${warningMsg}${dependenciesStr}\n\n${classDefinitionStr}`;

        const filePath: string = `${sourceDir}/${TypeORMActor.prefixEntity}${entityName}.ts`;

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
          typeSource: 'external',
        });
        const classContentStr: string = `${classContent
          .map((field: TypeORMActorField) => `  ${field.join('\n  ')}`)
          .join('\n\n')}`;
        const sourceClassName: string = `${TypeORMActor.prefixEntity}${entityName}`;
        const classDefinitionStr: string = `class ${entityName} extends ${sourceClassName} {\n${classContentStr}\n}\n\nexport default ${entityName};`;
        dependencies.push({
          type: 'default',
          name: sourceClassName,
          source: `../${sourceFolderName}/${TypeORMActor.prefixEntity}${entityName}`,
          level: 1,
          typeSource: 'internal',
        });

        const dependenciesStr: string = await TypeORMActor.getDependenciesStr(dependencies, targetDir);
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
