import React from 'react'
import '../styles/overlay.css'

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface GreenCornerOverlayProps {
  visible: boolean
  windowBounds?: WindowBounds | null
  opacity?: number
  appName?: string
  state?: 'monitoring' | 'processing'
  showShieldIcon?: boolean
}

const ARM_LENGTH = 40
const ARM_THICKNESS = 3

function Bracket({ position, color }: { position: string; color: string }) {
  const isTop = position.includes('top')
  const isLeft = position.includes('left')

  const hStyle: React.CSSProperties = {
    position: 'absolute',
    width: ARM_LENGTH,
    height: ARM_THICKNESS,
    background: color,
    transition: 'background 0.15s ease',
    ...(isTop ? { top: 0 } : { bottom: 0 }),
    ...(isLeft ? { left: 0 } : { right: 0 }),
  }

  const vStyle: React.CSSProperties = {
    position: 'absolute',
    width: ARM_THICKNESS,
    height: ARM_LENGTH,
    background: color,
    transition: 'background 0.15s ease',
    ...(isTop ? { top: 0 } : { bottom: 0 }),
    ...(isLeft ? { left: 0 } : { right: 0 }),
  }

  return (
    <div style={{ position: 'absolute', ...(isTop ? { top: 0 } : { bottom: 0 }), ...(isLeft ? { left: 0 } : { right: 0 }) }}>
      <div style={hStyle} />
      <div style={vStyle} />
    </div>
  )
}

export function GreenCornerOverlay({
  visible,
  windowBounds,
  opacity = 0.9,
  state = 'processing',
  showShieldIcon = true,
}: GreenCornerOverlayProps) {
  if (!visible) return null
  const hasBounds = windowBounds && windowBounds.width >= 50 && windowBounds.height >= 50
  if (!hasBounds) return null

  const color = state === 'monitoring' ? '#22c55e' : '#808080'

  return (
    <div
      className="scamshield-corner-overlay overlay-visible"
      data-state={state}
      style={{ opacity }}
      aria-hidden="true"
      role="presentation"
    >
      <div
        className="corners has-bounds"
        style={{
          position: 'absolute',
          left: windowBounds.x,
          top: windowBounds.y,
          width: windowBounds.width,
          height: windowBounds.height,
        }}
      >
        <Bracket position="top-left" color={color} />
        <Bracket position="top-right" color={color} />
        <Bracket position="bottom-left" color={color} />
        <Bracket position="bottom-right" color={color} />
        {showShieldIcon && (
          <div style={{ position: 'absolute', top: 10, right: 10, opacity: 0.7, pointerEvents: 'none' }} aria-hidden>
            <ShieldIcon color={color} />
          </div>
        )}
      </div>
    </div>
  )
}

function ShieldIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}

export default GreenCornerOverlay
