import * as migration_20260729_101652_initial from './20260729_101652_initial';

export const migrations = [
  {
    up: migration_20260729_101652_initial.up,
    down: migration_20260729_101652_initial.down,
    name: '20260729_101652_initial'
  },
];
