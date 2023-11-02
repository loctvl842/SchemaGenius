import _ from 'lodash';
import { Dependency } from '../../types/SeedActor';
import { TypeORMActorImportCommand } from '../../types/TypeORMActor';
import SeedActor from '../SeedActor';

class TypeORMHelper {
  static async getDependenciesStr(dependencies: Dependency[], targetDir: string): Promise<string> {
    const uniqDependencies = _.uniqWith([...dependencies], _.isEqual);
    const uniqDependenciesBySource = Object.entries(_.groupBy(uniqDependencies, 'source'));
    const importCommands: TypeORMActorImportCommand[] = await Promise.all(
      uniqDependenciesBySource.map(
        async ([source, groupedDeps]: [string, Dependency[]]): Promise<TypeORMActorImportCommand> => {
          const { level, typeSource } = groupedDeps[0];
          if (typeSource === 'external') {
            await SeedActor.resolveDependency(source, targetDir);
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
}

export default TypeORMHelper;
