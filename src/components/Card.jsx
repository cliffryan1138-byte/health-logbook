import Icon from '../lib/icons'

export default function Card({ icon, title, tag, wide, children }) {
  return (
    <div className={wide ? 'card wide' : 'card'}>
      <div className="card-head">
        <span className="ico"><Icon name={icon} /></span>
        <h3>{title}</h3>
        {tag && <span className="tag">{tag}</span>}
      </div>
      {children}
    </div>
  )
}
