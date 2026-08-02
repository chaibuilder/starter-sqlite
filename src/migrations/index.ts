import * as migration_20260724_153838_initial from './20260724_153838_initial';
import * as migration_20260802_002150_media_prefix from './20260802_002150_media_prefix';

export const migrations = [
  {
    up: migration_20260724_153838_initial.up,
    down: migration_20260724_153838_initial.down,
    name: '20260724_153838_initial',
  },
  {
    up: migration_20260802_002150_media_prefix.up,
    down: migration_20260802_002150_media_prefix.down,
    name: '20260802_002150_media_prefix'
  },
];
