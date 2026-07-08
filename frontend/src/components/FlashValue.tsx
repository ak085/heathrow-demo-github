import React, { useEffect, useRef, useState } from 'react'

interface Props {
  /** The numeric value to watch — wrap the same value you're rendering as children. */
  value: number
  children: React.ReactNode
}

/** Briefly highlights its children green/red when `value` changes, so live-updating
 *  numbers (refreshed every 5s from the mock data stores) read as visibly live rather
 *  than static text that happens to update. */
export const FlashValue: React.FC<Props> = ({ value, children }) => {
  const prevRef = useRef(value)
  const [flash, setFlash] = useState<'up' | 'down' | null>(null)

  useEffect(() => {
    if (prevRef.current !== value) {
      setFlash(value > prevRef.current ? 'up' : 'down')
      prevRef.current = value
      const t = setTimeout(() => setFlash(null), 900)
      return () => clearTimeout(t)
    }
  }, [value])

  return (
    <span
      style={{
        transition: 'background-color 0.8s ease',
        backgroundColor: flash === 'up' ? 'rgba(82,196,26,0.25)' : flash === 'down' ? 'rgba(255,77,79,0.25)' : 'transparent',
        borderRadius: 4,
        padding: '0 3px',
        display: 'inline-block',
      }}
    >
      {children}
    </span>
  )
}

export default FlashValue
