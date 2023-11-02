export interface SeedActorAuthor {
  name: string;
  email: string;
}

export interface FileSegment {
  content: string;
  dependencies: Dependency[];
}

export interface Dependency {
  type: 'named' | 'default';
  name: string;
  source: string;
  level: number;
  typeSource: 'internal' | 'external';
}

