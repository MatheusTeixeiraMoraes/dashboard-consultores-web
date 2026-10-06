import type { ReactNode } from 'react'

type Category = 'performance' | 'portfolio' | 'field' | 'admin'

const CONFIG: Record<Category, { label: string; mark: ReactNode }> = {
  performance: {
    label: 'CENTRAL DE DESEMPENHO',
    mark: <path d="M3 17.5 9 11l4 3 7-8M15 6h5v5" />,
  },
  portfolio: {
    label: 'GESTÃO DE CARTEIRA',
    mark: <><circle cx="9" cy="8" r="3" /><path d="M3 20c.5-3.5 2.4-5.5 6-5.5s5.5 2 6 5.5M16 11h5m-2.5-2.5v5" /></>,
  },
  field: {
    label: 'OPERAÇÃO DE CAMPO',
    mark: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  },
  admin: {
    label: 'CENTRAL DE OPERAÇÃO',
    mark: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 9h8M8 13h8M8 17h4" /></>,
  },
}

const CATEGORY_CLASS: Record<Category, string> = {
  performance: 'category-heading--performance',
  portfolio: 'category-heading--portfolio',
  field: 'category-heading--field',
  admin: 'category-heading--admin',
}

export default function CategoryHeader({
  category,
  title,
  description,
  actions,
}: {
  category: Category
  title: string
  description?: ReactNode
  actions?: ReactNode
}) {
  const config = CONFIG[category]

  return (
    <header className={`category-heading ${CATEGORY_CLASS[category]}`}>
      <div className="category-heading__main">
        <span className="category-heading__icon" aria-hidden="true">
          <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {config.mark}
          </svg>
        </span>
        <div className="min-w-0">
          <p className="category-heading__eyebrow">{config.label}</p>
          <h1 className="category-heading__title">{title}</h1>
          {description && <p className="category-heading__description">{description}</p>}
        </div>
      </div>
      {actions && <div className="category-heading__actions">{actions}</div>}
    </header>
  )
}
