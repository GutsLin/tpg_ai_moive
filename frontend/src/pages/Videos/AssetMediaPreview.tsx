import type { AssetItem } from '../../api/assets'

const resolveMediaUrl = (asset: AssetItem) => asset.sourceUrl ?? asset.thumbnailUrl

export const AssetMediaPreview = ({
  asset,
  imageAlt,
  videoLabel,
  audioLabel,
  height,
}: {
  asset: AssetItem
  imageAlt: string
  videoLabel: string
  audioLabel: string
  height: number
}) => {
  if (asset.assetType === 'Image') {
    return (
      <img
        src={asset.thumbnailUrl}
        alt={imageAlt}
        style={{
          display: 'block',
          maxWidth: '100%',
          maxHeight: height - 24,
          width: 'auto',
          height: 'auto',
          objectFit: 'contain',
        }}
      />
    )
  }

  if (asset.assetType === 'Video') {
    return (
      <video
        aria-label={videoLabel}
        src={resolveMediaUrl(asset)}
        controls
        preload="metadata"
        playsInline
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          background: '#020617',
        }}
      />
    )
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <audio aria-label={audioLabel} src={resolveMediaUrl(asset)} controls preload="metadata" style={{ width: '100%' }} />
    </div>
  )
}
