export type TypeORMColumnDecoratorType = 'Column' | 'PrimaryColumn';

export type TypeORMRelationDecoratorType = 'OneToOne' | 'OneToMany' | 'ManyToOne' | 'ManyToMany';

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
  dependencies: Dependency[];
}

export interface TypeORMActorClassDefinition {
  classDefinitionStr: string;
  dependencies: Dependency[];
}

export type TypeORMActorField = TypeORMActorFieldLine[];

export type TypeORMActorFieldLine = string;
