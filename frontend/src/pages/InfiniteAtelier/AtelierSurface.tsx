import { AimOutlined, MinusOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Empty, Space, Tooltip } from 'antd'
import { useRef, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react'

import type { AssetItem } from '../../api/assets'
import { ImageNode } from './ImageNode'
import type { CanvasDocument, CanvasNode, CanvasViewport } from './model'

const clampScale = (scale: number) => Math.min(2.5, Math.max(0.25, scale))

type DragState =
  | { mode: 'pan'; pointerId: number; clientX: number; clientY: number; viewport: CanvasViewport }
  | { mode: 'node'; pointerId: number; clientX: number; clientY: number; nodeId: string; x: number; y: number }

interface AtelierSurfaceProps {
  document: CanvasDocument
  localUrls: Record<string, string>
  assetsById: Map<number, AssetItem>
  writable: boolean
  onDocumentChange: (updater: (current: CanvasDocument) => CanvasDocument) => void
  onCrop: (node: CanvasNode) => void
  onSplit: (node: CanvasNode) => void
  onUpscale: (node: CanvasNode) => void
  onMask: (node: CanvasNode) => void
  onRemove: (node: CanvasNode) => void
}

export const AtelierSurface = ({ document, localUrls, assetsById, writable, onDocumentChange, onCrop, onSplit, onUpscale, onMask, onRemove }: AtelierSurfaceProps) => {
  const drag = useRef<DragState | null>(null)

  const setViewport = (viewport: CanvasViewport) => onDocumentChange((current) => ({ ...current, viewport }))
  const zoomAroundCenter = (factor: number) => setViewport({ ...document.viewport, k: clampScale(document.viewport.k * factor) })
  const resetView = () => setViewport({ x: 24, y: 24, k: 1 })

  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('[data-atelier-node]')) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { mode: 'pan', pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, viewport: document.viewport }
  }

  const startNodeDrag = (event: ReactPointerEvent<HTMLDivElement>, node: CanvasNode) => {
    if (!writable || event.button !== 0 || (event.target as HTMLElement).closest('button,a,input')) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { mode: 'node', pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, nodeId: node.id, x: node.x, y: node.y }
  }

  const movePointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    if (current.mode === 'pan') {
      setViewport({ ...current.viewport, x: current.viewport.x + event.clientX - current.clientX, y: current.viewport.y + event.clientY - current.clientY })
      return
    }
    const dx = (event.clientX - current.clientX) / document.viewport.k
    const dy = (event.clientY - current.clientY) / document.viewport.k
    onDocumentChange((canvas) => ({ ...canvas, nodes: canvas.nodes.map((node) => node.id === current.nodeId ? { ...node, x: current.x + dx, y: current.y + dy } : node) }))
  }

  const endPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = null
  }

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const nextScale = clampScale(document.viewport.k * (event.deltaY > 0 ? 0.9 : 1.1))
    const bounds = event.currentTarget.getBoundingClientRect()
    const cursorX = event.clientX - bounds.left
    const cursorY = event.clientY - bounds.top
    const worldX = (cursorX - document.viewport.x) / document.viewport.k
    const worldY = (cursorY - document.viewport.y) / document.viewport.k
    setViewport({ x: cursorX - worldX * nextScale, y: cursorY - worldY * nextScale, k: nextScale })
  }

  return <div
    aria-label="无限画布工作区"
    onPointerDown={startPan}
    onPointerMove={movePointer}
    onPointerUp={endPointer}
    onPointerCancel={endPointer}
    onWheel={handleWheel}
    style={{ position: 'relative', minHeight: 620, height: 'calc(100vh - 250px)', overflow: 'hidden', border: '1px solid #d9e1e7', backgroundColor: '#f7f8f6', backgroundImage: 'linear-gradient(#dfe5e5 1px, transparent 1px), linear-gradient(90deg, #dfe5e5 1px, transparent 1px)', backgroundPosition: `${document.viewport.x}px ${document.viewport.y}px`, backgroundSize: `${32 * document.viewport.k}px ${32 * document.viewport.k}px`, cursor: drag.current?.mode === 'pan' ? 'grabbing' : 'grab', touchAction: 'none' }}
  >
    <div style={{ position: 'absolute', inset: 0, transformOrigin: '0 0', transform: `translate(${document.viewport.x}px, ${document.viewport.y}px) scale(${document.viewport.k})` }}>
      {document.nodes.map((node) => {
        const asset = node.assetId ? assetsById.get(node.assetId) : undefined
        return <div key={node.id} data-atelier-node onPointerDown={(event) => startNodeDrag(event, node)} style={{ position: 'absolute', left: node.x, top: node.y, width: 240, background: '#fff', border: '1px solid #d7dfe3', boxShadow: '0 8px 24px rgba(22, 38, 45, 0.10)', cursor: writable ? 'move' : 'default' }}>
          <ImageNode name={node.name ?? node.text} prompt={node.prompt} assetId={node.assetId} remoteStatus={asset?.arkStatus ?? node.remoteStatus} url={localUrls[node.id] ?? asset?.thumbnailUrl ?? node.remoteUrl} onCrop={() => onCrop(node)} onSplit={() => onSplit(node)} onUpscale={() => onUpscale(node)} onMask={() => onMask(node)} onRemove={() => onRemove(node)} />
        </div>
      })}
    </div>
    {document.nodes.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="画布为空，导入图片开始创作" style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', pointerEvents: 'none' }} /> : null}
    <Space size={4} style={{ position: 'absolute', right: 16, bottom: 16, padding: 4, background: '#fff', border: '1px solid #d9e1e7', boxShadow: '0 4px 16px rgba(22, 38, 45, 0.10)' }}>
      <Tooltip title="缩小"><Button aria-label="缩小画布" type="text" icon={<MinusOutlined />} onClick={() => zoomAroundCenter(0.9)} /></Tooltip>
      <span style={{ width: 54, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{Math.round(document.viewport.k * 100)}%</span>
      <Tooltip title="放大"><Button aria-label="放大画布" type="text" icon={<PlusOutlined />} onClick={() => zoomAroundCenter(1.1)} /></Tooltip>
      <Tooltip title="重置视图"><Button aria-label="重置画布视图" type="text" icon={<AimOutlined />} onClick={resetView} /></Tooltip>
    </Space>
  </div>
}
