import React from 'react'
import { Card, Typography } from 'antd'

const { Text } = Typography

interface Props {
  src: string
  alt: string
  caption?: string
  /** 'compact' (default) for pages with other content below — capped width so the
   *  image stays a modest banner. 'large' for tabs where the image is the only
   *  content (e.g. a dedicated System Schematic tab) — allowed to fill more width. */
  size?: 'compact' | 'large'
}

const MAX_WIDTH: Record<NonNullable<Props['size']>, number> = {
  compact: 720,
  large: 1100,
}

const PageHeroImage: React.FC<Props> = ({ src, alt, caption, size = 'compact' }) => (
  <Card size="small" style={{ marginBottom: 16 }} styles={{ body: { padding: 16, textAlign: 'left' } }}>
    <img
      src={src}
      alt={alt}
      loading="lazy"
      style={{ width: '100%', maxWidth: MAX_WIDTH[size], height: 'auto', display: 'block', borderRadius: 6 }}
    />
    {caption && (
      <div style={{ marginTop: 10 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>{caption}</Text>
      </div>
    )}
  </Card>
)

export default PageHeroImage
