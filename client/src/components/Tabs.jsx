import { useId, useRef, useState } from 'react'

/** Arrow keys move focus; Enter/Space activate panels that may load data. */
export default function Tabs({ label, tabs, value, onChange, buttonClass, children }) {
  const id = useId()
  const buttons = useRef([])
  const [focused, setFocused] = useState(value)
  function move(event, index) {
    const next = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key]
    if (next === undefined) return
    event.preventDefault()
    buttons.current[next]?.focus()
  }
  return <>
    <div role="tablist" aria-label={label} className="layout-actions" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(value) }}>
      {tabs.map((tab, index) => <button key={tab.value} ref={element => { buttons.current[index] = element }} type="button" role="tab" id={`${id}-tab-${tab.value}`} aria-controls={`${id}-panel-${tab.value}`} aria-selected={value === tab.value} tabIndex={focused === tab.value ? 0 : -1} className={`${buttonClass} ${value === tab.value ? 'bg-teal-50 dark:bg-teal-950 ring-1 ring-teal-700 dark:ring-teal-400' : ''}`} onFocus={() => setFocused(tab.value)} onClick={() => onChange(tab.value)} onKeyDown={event => move(event, index)}>{tab.label}</button>)}
    </div>
    {tabs.map(tab => <div key={tab.value} role="tabpanel" id={`${id}-panel-${tab.value}`} aria-labelledby={`${id}-tab-${tab.value}`} hidden={value !== tab.value} tabIndex={0}>{value === tab.value ? children : null}</div>)}
  </>
}
