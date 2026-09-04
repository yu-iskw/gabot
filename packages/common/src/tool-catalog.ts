export const COMPUTER_NAVIGATE = 'computer_navigate';
export const COMPUTER_SCREENSHOT = 'computer_screenshot';
export const MCP_ECHO = 'mcp__mock__echo';
export const COMPONENT_NOTE = 'component_note';
export const ASK_PERSON = 'ask_person';
export const CREATE_BOT = 'create_bot';
export const CREATE_ROUTINE = 'create_routine';
export const UPDATE_ROUTINE = 'update_routine';

export const COMPUTER_TOOLS = [
  {
    name: COMPUTER_NAVIGATE,
    description: 'Open a URL in this Bot computer browser.',
    parameters: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
    },
  },
  {
    name: COMPUTER_SCREENSHOT,
    description: 'Capture the current page as a PNG.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
] as const;

export const MCP_ECHO_TOOL = {
  name: MCP_ECHO,
  description: 'Echo text through the mock MCP server.',
  parameters: {
    type: 'object',
    properties: { text: { type: 'string' } },
    required: ['text'],
  },
} as const;

export const COMPONENT_NOTE_TOOL = {
  name: COMPONENT_NOTE,
  description: 'Render a granted note component.',
  parameters: {
    type: 'object',
    properties: { title: { type: 'string' }, body: { type: 'string' } },
    required: ['title'],
  },
} as const;

export const ASK_PERSON_TOOL = {
  name: ASK_PERSON,
  description: 'Ask a person via the work queue. Durable handoff, not an in-memory A2A task.',
  parameters: {
    type: 'object',
    properties: { prompt: { type: 'string' } },
    required: ['prompt'],
  },
} as const;

export const CREATE_BOT_TOOL = {
  name: CREATE_BOT,
  description: 'Create a new coworker bot from this conversation.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      title: { type: 'string' },
      roleDescription: { type: 'string' },
    },
    required: ['name'],
  },
} as const;

export const CREATE_ROUTINE_TOOL = {
  name: CREATE_ROUTINE,
  description: 'Schedule a recurring task for this bot on this channel.',
  parameters: {
    type: 'object',
    properties: {
      instruction: { type: 'string' },
      cron: { type: 'string' },
      timezone: { type: 'string' },
    },
    required: ['instruction', 'cron'],
  },
} as const;

export const UPDATE_ROUTINE_TOOL = {
  name: UPDATE_ROUTINE,
  description: 'Update an existing routine instruction, schedule, timezone, or enabled state.',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      instruction: { type: 'string' },
      cron: { type: 'string' },
      timezone: { type: 'string' },
      enabled: { type: 'boolean' },
    },
    required: ['id'],
  },
} as const;
