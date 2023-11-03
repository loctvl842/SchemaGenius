import fs from 'fs';
import * as inflection from 'inflection';
import _ from 'lodash';
import path from 'path';
import { ActionType } from '../../types/Action';
import {
  TypeORMActorEntity,
  TypeORMActorField,
  TypeORMActorFieldLine,
  TypeORMColumnDecoratorType,
  TypeORMRelationDecoratorType,
} from '../../types/TypeORMActor';
import { IDatabase, ISchema } from '../../types/dbml';
import { pgTypeToTsType } from '../../utils';
import TypeORMConfig from './Config';
import SeedActor from '../SeedActor';
import { Dependency, SeedActorAuthor } from '../../types/SeedActor';
import { DatabaseInfo } from '../../types/Database';
import TypeORMHelper from './Helper';

class TypeORMActor {
  private static _requiredPackages: Set<string> = new Set();

  static addRequiredPackage(pkg: string) {
    TypeORMActor._requiredPackages.add(pkg);
  }

  static get requiredPackages() {
    const requiredPackages = new Set(TypeORMActor._requiredPackages);
    return Array.from(requiredPackages);
  }

  /*
   * Defines the prefix used for entity names.
   * For example, 'Ab' is the marker indicating an abstract class;
   * therefore, 'AbMovie' signifies an abstract entity representing movies.
   */
  static prefixEntity = 'Core';

  static getFieldArr(tableId: number, model: IDatabase): { fields: TypeORMActorField[]; dependencies: Dependency[] } {
    const table = model.tables[tableId];

    const dependencies: Dependency[] = [];
    const fields = table.fieldIds.map((fieldId: number) => {
      const field = model.fields[fieldId];

      // helper
      const getColumnDecoratorStr = (columnDecorator: TypeORMColumnDecoratorType, columnOptions: string) => {
        const dependency: Dependency = {
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

  static getWarningMsg(entity: TypeORMActorEntity, author: SeedActorAuthor): string {
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
    const author = await SeedActor.getAuthorInfo();

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

        const dependenciesStr: string = await TypeORMHelper.getDependenciesStr(
          dependencies,
          targetDir,
          TypeORMActor.addRequiredPackage,
        );
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
          description: filePath,
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

        dependencies.forEach(dep => {
          if (dep.typeSource === 'external') {
            TypeORMActor.addRequiredPackage(dep.source);
          }
        });

        const dependenciesStr: string = await TypeORMHelper.getDependenciesStr(
          dependencies,
          targetDir,
          TypeORMActor.addRequiredPackage,
        );
        const entityStr: string = `${dependenciesStr}\n\n${entityDecoratorStr}\n${classDefinitionStr}`;

        return {
          type: 'add',
          path: `${mapperDir}/${entityName}.ts`,
          template: entityStr,
          description: `${mapperDir}/${entityName}.ts`,
          skipIfExists: true,
        };
      }),
    );
    actions.push(...actionsGenerateMapperEntities);

    return actions;
  }

  static async getActions(
    targetDbDir: string,
    entitiesDirName: string,
    dbInfo: DatabaseInfo,
    model: IDatabase,
  ): Promise<ActionType[]> {
    const targetDirPath = path.resolve(targetDbDir, entitiesDirName);
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

    actions.push(await TypeORMConfig.getAction(targetDbDir, entitiesDirName, dbInfo, TypeORMActor.addRequiredPackage));

    return actions;
  }
}

export default TypeORMActor;
