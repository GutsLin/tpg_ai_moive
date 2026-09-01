import { DownloadOutlined, ScissorOutlined, SplitCellsOutlined, ZoomInOutlined } from '@ant-design/icons'
import { Button, Space, Tooltip } from 'antd'

export const ImageNode = ({ name, url, prompt, onCrop, onSplit, onUpscale, onMask }: { name: string; url?: string; prompt?: string; onCrop: () => void; onSplit: () => void; onUpscale: () => void; onMask: () => void }) => <div>
  {url ? <img src={url} alt={name} style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', display: 'block' }} /> : <div style={{ aspectRatio: '1 / 1', display: 'grid', placeItems: 'center', background: '#f2f2f2' }}>本地图片不可用</div>}
  <div style={{ padding: 10 }}><strong>{name}</strong>{prompt ? <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{prompt}</div> : null}<Space size={4} style={{ marginTop: 8 }}>
    <Tooltip title="裁剪"><Button size="small" icon={<ScissorOutlined />} onClick={onCrop} /></Tooltip>
    <Tooltip title="水平二分"><Button size="small" icon={<SplitCellsOutlined />} onClick={onSplit} /></Tooltip>
    <Tooltip title="2x 放大"><Button size="small" icon={<ZoomInOutlined />} onClick={onUpscale} /></Tooltip>
    <Tooltip title="圆形蒙版"><Button size="small" onClick={onMask}>蒙版</Button></Tooltip>
    {url ? <Tooltip title="下载"><Button size="small" icon={<DownloadOutlined />} href={url} download={`${name}.png`} /></Tooltip> : null}
  </Space></div>
</div>
