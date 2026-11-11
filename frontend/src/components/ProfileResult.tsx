import { createElement, Fragment, type ReactNode } from 'react'

function renderValue(value: unknown, depth = 1): ReactNode {
  if (value === null || value === undefined) {
    return <p className="result-leaf">Not provided</p>
  }

  if (typeof value === 'string' || typeof value === 'number') {
    return <p className="result-leaf">{String(value)}</p>
  }

  if (typeof value === 'boolean') {
    return <p className="result-leaf">{value ? 'Yes' : 'No'}</p>
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <p className="result-leaf">No items</p>

    return (
      <ul className="result-list">
        {value.map((item, index) => (
          <li key={index}>{renderValue(item, depth)}</li>
        ))}
      </ul>
    )
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value)
    if (entries.length === 0) return <p className="result-leaf">No details</p>

    return (
      <div className="result-fields">
        {entries.map(([key, child]) => {
          const Heading = `h${Math.min(depth, 3)}` as 'h1' | 'h2' | 'h3'
          return (
            <section className="result-field" key={key}>
              {createElement(Heading, { className: 'result-heading' }, formatLabel(key))}
              {renderValue(child, Math.min(depth + 1, 3))}
            </section>
          )
        })}
      </div>
    )
  }

  return <p className="result-leaf">{String(value)}</p>
}

function formatLabel(label: string): string {
  return label
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (character) => character.toUpperCase())
}

export function ProfileResult({ result }: { result: unknown }) {
  return (
    <article className="result-card">
      <div className="result-card-heading">
        <span className="eyebrow">YOUR PROFILE REVIEW</span>
        <span className="result-status"><span /> Analysis complete</span>
      </div>
      <div className="result-content">
        {renderValue(result)}
      </div>
    </article>
  )
}

export function ScanningSkeleton() {
  return (
    <div className="result-card scanning-card" aria-label="Reviewing profile" role="status">
      <div className="scanner-line" />
      <div className="skeleton-heading">
        <span className="skeleton-chip" />
        <span className="skeleton-title" />
      </div>
      {[0, 1, 2].map((item) => (
        <Fragment key={item}>
          <span className="skeleton-label" />
          <span className={`skeleton-copy skeleton-copy-${item}`} />
        </Fragment>
      ))}
      <span className="sr-only">Reviewing your profile…</span>
    </div>
  )
}
