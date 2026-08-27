import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export interface PromptInputProps {
  value: string
  onChange: (value: string) => void
  availableMentions: string[]
  ariaLabel?: string
  placeholder?: string
}

interface MentionState {
  active: boolean
  query: string
  startIndex: number
  selectedIndex: number
}

const initialMentionState: MentionState = {
  active: false,
  query: '',
  startIndex: -1,
  selectedIndex: 0,
}

export const PromptInput = ({
  value,
  onChange,
  availableMentions,
  ariaLabel = '创意提示词',
  placeholder = '输入创意描述，可使用 @素材名 引用已选素材',
}: PromptInputProps) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [mention, setMention] = useState<MentionState>(initialMentionState)

  const filteredMentions = useMemo(() => {
    if (!mention.active) return []
    const query = mention.query.toLowerCase()
    if (!query) return availableMentions
    return availableMentions.filter((name) => name.toLowerCase().includes(query))
  }, [mention.active, mention.query, availableMentions])

  const insertMention = useCallback(
    (name: string) => {
      const textarea = textareaRef.current
      if (!textarea) return

      const before = value.slice(0, mention.startIndex)
      const after = value.slice(textarea.selectionStart)
      const insert = `@${name} `
      const nextValue = `${before}${insert}${after}`

      onChange(nextValue)
      setMention(initialMentionState)

      requestAnimationFrame(() => {
        const pos = (before + insert).length
        textarea.focus()
        textarea.setSelectionRange(pos, pos)
      })
    },
    [value, mention.startIndex, onChange]
  )

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.target.value
    const cursorPos = event.target.selectionStart
    const textBeforeCursor = nextValue.slice(0, cursorPos)

    const atMatch = textBeforeCursor.match(/@([^\s@]*)$/)

    if (atMatch && availableMentions.length > 0) {
      setMention({
        active: true,
        query: atMatch[1],
        startIndex: cursorPos - atMatch[0].length,
        selectedIndex: 0,
      })
    } else {
      if (mention.active) {
        setMention(initialMentionState)
      }
    }

    onChange(nextValue)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!mention.active || filteredMentions.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setMention((prev) => ({
        ...prev,
        selectedIndex: (prev.selectedIndex + 1) % filteredMentions.length,
      }))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setMention((prev) => ({
        ...prev,
        selectedIndex:
          prev.selectedIndex <= 0
            ? filteredMentions.length - 1
            : prev.selectedIndex - 1,
      }))
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      const selected = filteredMentions[mention.selectedIndex]
      if (selected) {
        insertMention(selected)
      }
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setMention(initialMentionState)
    }
  }

  const handleBlur = () => {
    setTimeout(() => {
      setMention(initialMentionState)
    }, 150)
  }

  useEffect(() => {
    if (mention.active && mention.selectedIndex >= filteredMentions.length) {
      setMention((prev) => ({ ...prev, selectedIndex: 0 }))
    }
  }, [mention.active, mention.selectedIndex, filteredMentions.length])

  const showMentions = mention.active && filteredMentions.length > 0

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <textarea
        ref={textareaRef}
        aria-label={ariaLabel}
        value={value}
        rows={5}
        maxLength={5000}
        placeholder={placeholder}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        style={{
          width: '100%',
          borderRadius: 20,
          border: '1px solid #cbd5e1',
          padding: 16,
          resize: 'vertical',
          minHeight: 120,
          fontFamily: 'inherit',
          fontSize: 'inherit',
          lineHeight: 1.6,
        }}
      />
      {showMentions ? (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 16,
            right: 16,
            marginBottom: 4,
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            boxShadow: '0 12px 32px rgba(15, 23, 42, 0.12)',
            overflow: 'hidden',
            zIndex: 1000,
            maxHeight: 240,
            overflowY: 'auto',
          }}
        >
          {filteredMentions.map((name, index) => (
            <div
              key={name}
              style={{
                padding: '8px 14px',
                cursor: 'pointer',
                background:
                  index === mention.selectedIndex ? '#f1f5f9' : '#ffffff',
                fontSize: 14,
                color: '#0f172a',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                transition: 'background 0.1s',
              }}
              onMouseDown={(event) => {
                event.preventDefault()
                insertMention(name)
              }}
              onMouseEnter={() => {
                setMention((prev) => ({ ...prev, selectedIndex: index }))
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  background: '#e0e7ff',
                  color: '#4338ca',
                  fontSize: 12,
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                @
              </span>
              {name}
            </div>
          ))}
        </div>
      ) : null}
      {availableMentions.length > 0 && !mention.active ? (
        <div
          style={{
            padding: '6px 2px 0',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
          }}
        >
          {availableMentions.map((name) => (
            <span
              key={name}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '2px 10px',
                borderRadius: 999,
                background: '#f1f5f9',
                border: '1px solid #e2e8f0',
                fontSize: 12,
                color: '#475569',
                cursor: 'pointer',
              }}
              onClick={() => {
                const textarea = textareaRef.current
                if (!textarea) return
                const pos = textarea.selectionStart
                const before = value.slice(0, pos)
                const after = value.slice(pos)
                const insert = `@${name} `
                onChange(`${before}${insert}${after}`)
                requestAnimationFrame(() => {
                  const newPos = (before + insert).length
                  textarea.focus()
                  textarea.setSelectionRange(newPos, newPos)
                })
              }}
            >
              @{name}
            </span>
          ))}
        </div>
      ) : null}
      {availableMentions.length === 0 ? (
        <div style={{ padding: '6px 2px 0' }}>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>
            选中素材后，可在提示词中输入 @ 引用素材
          </span>
        </div>
      ) : null}
    </div>
  )
}
