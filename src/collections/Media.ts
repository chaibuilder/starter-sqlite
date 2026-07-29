import type { CollectionConfig } from 'payload'
import { mediaAccess } from '@/access/authenticated'

export const Media: CollectionConfig = {
  slug: 'media',
  admin: {
    group: 'Site',
  },
  access: mediaAccess,
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
      localized: true,
    },
    {
      name: 'deletedAt',
      type: 'date',
      admin: {
        hidden: true,
      },
    },
    {
      name: 'deletedBy',
      type: 'text',
      admin: {
        hidden: true,
      },
    },
  ],
  upload: true,
}
