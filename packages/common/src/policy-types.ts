export type PolicyMode = 'dry-run' | 'enforce';

export type ActionPolicy = {
  mode: PolicyMode;
  deny: string[];
  allow: string[];
};

export type PolicyIntent =
  | 'activate'
  | 'type'
  | 'navigate'
  | 'read'
  | 'read_file'
  | 'write_file'
  | 'list_files'
  | 'read_tool'
  | 'write_tool'
  | 'run_command';

export type PolicyContext = {
  tool: { name: string };
  bot: { id: string };
  page: { url: string; host: string };
  actor: { id: string };
  element?: {
    ref: string;
    role: string;
    name: string;
    type?: string;
  };
  key?: string;
  intent?: PolicyIntent;
  file?: {
    path: string;
    name: string;
    extension: string;
  };
  mcp?: {
    server: string;
    tool: string;
    effect: 'read' | 'write' | '';
  };
  command?: string;
};

export type PolicyDecision = {
  allowed: boolean;
  mode: PolicyMode;
  matched: string | null;
  source: 'deny' | 'allow' | 'default';
  forward: boolean;
  reason: string;
};

export const DEFAULT_ALLOW_POLICY: ActionPolicy = {
  mode: 'enforce',
  deny: [],
  allow: ['true'],
};

export const PERMITTED_REASON = 'Permitted by policy.';
export const DEFAULT_DENY_REASON =
  "No rule in this deployment's policy permits that action, so it was refused. An administrator can add one.";
export const POLICY_BLOCK_PREFIX = "This deployment's policy does not allow that:";
