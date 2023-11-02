export type TypeORMColumnDecoratorType = 'Column' | 'PrimaryColumn';

export type TypeORMRelationDecoratorType = 'OneToOne' | 'OneToMany' | 'ManyToOne' | 'ManyToMany';

export interface TypeORMActorDependency {
  type: 'named' | 'default';
  name: string;
  source: string;
  level: number;
  typeSource: 'internal' | 'external';
}

export interface EntityConfig {
  name: string;
  template: string;
}

export interface TypeORMActorImportCommand {
  dependencyStr: string;
  source: string;
  level: number;
}

export interface TypeORMActorEntity {
  tableId: number;
  entityName: string;
  classContent: TypeORMActorField[];
  dependencies: TypeORMActorDependency[];
}

export interface TypeORMActorClassDefinition {
  classDefinitionStr: string;
  dependencies: TypeORMActorDependency[];
}

export type TypeORMActorField = TypeORMActorFieldLine[];

export type TypeORMActorFieldLine = string;

export interface TypeORMActorAuthor {
  name: string;
  email: string;
}
