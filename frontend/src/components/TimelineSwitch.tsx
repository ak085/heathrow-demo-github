import React from 'react'
import { Segmented } from 'antd'

export type TimelineDays = 1 | 2 | 3 | 7

interface TimelineSwitchProps {
  value: TimelineDays
  onChange: (days: TimelineDays) => void
  size?: 'small' | 'middle'
}

const OPTIONS: { label: string; value: TimelineDays }[] = [
  { label: '24H', value: 1 },
  { label: '2D', value: 2 },
  { label: '3D', value: 3 },
  { label: '7D', value: 7 },
]

/** Shared 24H/2D/3D/7D window switch — 7 days is the hard cap, per demo scope. */
export const TimelineSwitch: React.FC<TimelineSwitchProps> = ({ value, onChange, size = 'small' }) => (
  <Segmented
    size={size}
    value={value}
    onChange={(v) => onChange(v as TimelineDays)}
    options={OPTIONS}
  />
)

export default TimelineSwitch
