import type { Field, FieldHook } from 'payload'

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')

const generateFromTitle: FieldHook = ({ value, data, siblingData }) => {
  if (typeof value === 'string' && value.trim()) return slugify(value)
  const title = siblingData?.title ?? data?.title
  if (typeof title === 'string' && title.trim()) return slugify(title)
  return value
}

export const slugField = (
  options: { localized?: boolean; required?: boolean; admin?: any } = {},
): Field => ({
  name: 'slug',
  type: 'text',
  required: options.required !== false,
  unique: true,
  index: true,
  localized: options.localized || false,
  admin: {
    ...(options.admin !== undefined ? options.admin : { position: 'sidebar' }),
  },
  hooks: {
    beforeValidate: [generateFromTitle],
  },
  validate: (val: string | null | undefined) => {
    const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
    if (val && !slugRegex.test(val)) {
      return 'Slugs must only contain lowercase letters, numbers, and hyphens.'
    }
    return true // Validation passed
  },
})
