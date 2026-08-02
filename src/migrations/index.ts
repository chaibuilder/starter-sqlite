import * as migration_20260802_104829_initial from './20260802_104829_initial';

export const migrations = [
  {
    up: migration_20260802_104829_initial.up,
    down: migration_20260802_104829_initial.down,
    name: '20260802_104829_initial'
  },
];
