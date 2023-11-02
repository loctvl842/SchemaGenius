export type ActionType =
	| string
	| ActionConfig
	| AddActionConfig
	| AppendActionConfig
  | ReplaceActionConfig

export interface ActionConfig {
	type: string;
	force?: boolean;
	data?: object;
	skip?: () => boolean;
}

export type AddActionConfig =
  | AddActionConfigWithTemplate

interface AddActionConfigBase extends ActionConfig {
	type: 'add';
	path: string;
	skipIfExists?: boolean;
}

interface AddActionConfigWithTemplate extends AddActionConfigBase {
	template: string;
}

export interface AppendActionConfig extends ActionConfig {
	type: 'append';
	path: string;
	pattern: string | RegExp;
	template: string;
}

export interface ReplaceActionConfig extends ActionConfig {
  type: 'replace';
  path: string;
  pattern: string | RegExp;
  template: string;
}
