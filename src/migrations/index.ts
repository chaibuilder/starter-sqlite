import * as migration_20260802_094413_initial from './20260802_094413_initial';
import * as migration_20260921_093638_mcp_api_keys from './20260921_093638_mcp_api_keys';

export const migrations = [
  {
    up: migration_20260802_094413_initial.up,
    down: migration_20260802_094413_initial.down,
    name: '20260802_094413_initial',
  },
  {
    up: migration_20260921_093638_mcp_api_keys.up,
    down: migration_20260921_093638_mcp_api_keys.down,
    name: '20260921_093638_mcp_api_keys'
  },
];
