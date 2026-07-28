import * as migration_20260728_162121_initial from './20260728_162121_initial';

export const migrations = [
  {
    up: migration_20260728_162121_initial.up,
    down: migration_20260728_162121_initial.down,
    name: '20260728_162121_initial'
  },
];
