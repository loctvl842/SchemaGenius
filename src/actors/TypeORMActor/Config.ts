import { ActionType } from '../../types/Action';
import { DatabaseInfo } from '../../types/Database';
import { Dependency, FileSegment } from '../../types/SeedActor';
import TypeORMHelper from './Helper';

class TypeORMConfig {
  static getDbConfig(): FileSegment {
    const dependencies: Dependency[] = [];
    const content = `dotenv.config();

const { env } = process;

const dbConfig = {
  dbHost: env.DB_HOST || 'localhost',
  dbPort: parseInt(env.DB_PORT || '5432'),
  dbName: env.DB_NAME || 'test',
  dbUser: env.DB_USER || 'test',
  dbPass: env.DB_PASS || 'test',
};
`;
    dependencies.push({
      type: 'default',
      name: 'dotenv',
      source: 'dotenv',
      level: 0,
      typeSource: 'external',
    });
    return { content, dependencies };
  }

  static getInitDataSource(entityDirName: string, dbInfo: DatabaseInfo): FileSegment {
    const dbConfigSegment = TypeORMConfig.getDbConfig();
    const dependencies: Dependency[] = [...dbConfigSegment.dependencies];
    const content = `${dbConfigSegment.content}
const entityPath = resolve(__dirname, '${entityDirName}');
const migrationsPath = resolve(__dirname, 'migrations');

export const AppDataSource = new DataSource({
  type: '${dbInfo.type}',
  host: dbConfig.dbHost,
  port: dbConfig.dbPort,
  username: dbConfig.dbUser,
  password: dbConfig.dbPass,
  database: dbConfig.dbName,
  entities: [\`\${entityPath}/**/*{.ts,.js}\`],
  migrations: [\`\${migrationsPath}/**/*.ts\`],
});
`;
    dependencies.push({
      type: 'named',
      name: 'resolve',
      source: 'path',
      level: 0,
      typeSource: 'internal',
    });
    dependencies.push({
      type: 'named',
      name: 'DataSource',
      source: 'typeorm',
      level: 0,
      typeSource: 'external',
    });
    return { content, dependencies };
  }

  static async getAction(
    targetDbDir: string,
    entitiesDirName: string,
    dbInfo: DatabaseInfo,
    addRequiredPackage: (pkg: string) => void,
  ): Promise<ActionType> {
    const { content, dependencies } = TypeORMConfig.getInitDataSource(entitiesDirName, dbInfo);
    const dependenciesStr = await TypeORMHelper.getDependenciesStr(dependencies, targetDbDir, addRequiredPackage);
    addRequiredPackage(dbInfo.package);
    const template: string = `${dependenciesStr}\n\n${content}`;
    return {
      type: 'add',
      description: `${targetDbDir}/index.ts`,
      path: `${targetDbDir}/index.ts`,
      template,
      skipIfExists: true,
    };
  }
}

export default TypeORMConfig;
