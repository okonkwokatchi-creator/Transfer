import { useEffect, useRef, useState } from 'react'
import {
  ArrowDownToLine,
  Check,
  Clipboard,
  CloudUpload,
  File,
  FileArchive,
  FileAudio,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  LoaderCircle,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { storageBucket, supabase } from './lib/supabase'
import type { FileItem, Notice, TextItem, TransferItem } from './types'

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatUploadTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function getFileLabel(file: FileItem) {
  const type = file.file_type.toLowerCase()
  const extension = file.file_name.split('.').pop()?.toLowerCase() ?? ''
  if (type.startsWith('image/')) return 'Image'
  if (type === 'application/pdf' || extension === 'pdf') return 'PDF'
  if (type.includes('zip') || ['zip', 'rar', '7z', 'gz'].includes(extension)) return 'Archive'
  if (type.includes('spreadsheet') || ['xls', 'xlsx', 'csv'].includes(extension)) return 'Spreadsheet'
  if (type.includes('audio/')) return 'Audio'
  if (type.includes('video/')) return 'Video'
  if (type.includes('text/') || ['doc', 'docx', 'odt', 'rtf'].includes(extension)) return 'Document'
  if (['js', 'ts', 'json', 'html', 'css', 'py', 'md'].includes(extension)) return 'Code or text'
  return extension ? extension.toUpperCase() : 'File'
}

function FileKindIcon({ item }: { item: FileItem }) {
  const type = item.file_type.toLowerCase()
  const extension = item.file_name.split('.').pop()?.toLowerCase() ?? ''
  if (type.startsWith('image/')) return <FileImage aria-hidden="true" />
  if (type.includes('zip') || ['zip', 'rar', '7z', 'gz'].includes(extension)) return <FileArchive aria-hidden="true" />
  if (type.includes('spreadsheet') || ['xls', 'xlsx', 'csv'].includes(extension)) return <FileSpreadsheet aria-hidden="true" />
  if (type.startsWith('audio/')) return <FileAudio aria-hidden="true" />
  if (type.startsWith('video/')) return <FileVideo aria-hidden="true" />
  if (['js', 'ts', 'json', 'html', 'css', 'py', 'md'].includes(extension)) return <FileCode2 aria-hidden="true" />
  if (type.includes('text') || type.includes('pdf') || ['doc', 'docx', 'odt', 'rtf'].includes(extension)) return <FileText aria-hidden="true" />
  return <File aria-hidden="true" />
}

export default function App() {
  const [files, setFiles] = useState<FileItem[]>([])
  const [texts, setTexts] = useState<TextItem[]>([])
  const [loading, setLoading] = useState(Boolean(supabase))
  const [dragActive, setDragActive] = useState(false)
  const [uploadTotal, setUploadTotal] = useState(0)
  const [uploadDone, setUploadDone] = useState(0)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [textOpen, setTextOpen] = useState(false)
  const [textContent, setTextContent] = useState('')
  const [savingText, setSavingText] = useState(false)
  const [preview, setPreview] = useState<{ item: FileItem; url: string; temporary: boolean } | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textInputRef = useRef<HTMLTextAreaElement>(null)
  const isUploading = uploadTotal > 0

  const showNotice = (message: string, tone: Notice['tone'] = 'info') => {
    setNotice({ message, tone })
  }

  async function refreshItems() {
    if (!supabase) return
    const client = supabase
    const [fileResponse, textResponse] = await Promise.all([
      client.from('transfer_files').select('*').order('created_at', { ascending: false }),
      client.from('transfer_texts').select('*').order('created_at', { ascending: false }),
    ])

    if (fileResponse.error || textResponse.error) {
      showNotice('Could not load recent items. Check your connection and try again.', 'error')
      return
    }

    const fileRows = (fileResponse.data ?? []) as FileItem[]
    const withPreviews = await Promise.all(fileRows.map(async (item) => {
      if (!item.file_type.toLowerCase().startsWith('image/')) return item
      const { data } = await client.storage.from(storageBucket).createSignedUrl(item.storage_path, 3600)
      return data?.signedUrl ? { ...item, previewUrl: data.signedUrl } : item
    }))

    setFiles(withPreviews)
    setTexts((textResponse.data ?? []) as TextItem[])
  }

  useEffect(() => {
    if (supabase) {
      void refreshItems().finally(() => setLoading(false))
    }
  }, [])

  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(null), 4200)
    return () => window.clearTimeout(timeout)
  }, [notice])

  useEffect(() => {
    if (textOpen) textInputRef.current?.focus()
  }, [textOpen])

  useEffect(() => {
    if (!textOpen && !preview) return
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setTextOpen(false)
        closePreview()
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [textOpen, preview])

  function closePreview() {
    setPreview((current) => {
      if (current?.temporary) URL.revokeObjectURL(current.url)
      return null
    })
  }

  async function uploadFiles(selectedFiles: FileList | File[]) {
    if (!supabase) {
      showNotice('Connect Supabase before uploading files.', 'error')
      return
    }
    const client = supabase
    const queue = Array.from(selectedFiles)
    if (queue.length === 0) return

    setUploadTotal(queue.length)
    setUploadDone(0)
    let completed = 0
    let uploaded = 0
    let failed = 0

    await Promise.all(queue.map(async (file) => {
      try {
        const storagePath = `${crypto.randomUUID()}/${file.name}`
        const { error: uploadError } = await client.storage
          .from(storageBucket)
          .upload(storagePath, file, { contentType: file.type || 'application/octet-stream' })
        if (uploadError) throw uploadError

        const { error: metadataError } = await client.from('transfer_files').insert({
          file_name: file.name,
          file_type: file.type || 'application/octet-stream',
          file_size: file.size,
          storage_path: storagePath,
        })

        if (metadataError) {
          await client.storage.from(storageBucket).remove([storagePath])
          throw metadataError
        }
        uploaded += 1
      } catch {
        failed += 1
      } finally {
        completed += 1
        setUploadDone(completed)
      }
    }))

    await refreshItems()
    setUploadTotal(0)
    if (failed > 0 && uploaded > 0) {
      showNotice(`${uploaded} uploaded; ${failed} couldn't be uploaded. Please try again.`, 'error')
    } else if (failed > 0) {
      showNotice('Upload failed. Please try again.', 'error')
    } else {
      showNotice(uploaded === 1 ? 'File uploaded.' : `${uploaded} files uploaded.`, 'success')
    }
  }

  async function downloadFile(item: FileItem) {
    if (!supabase) return
    showNotice(`Preparing ${item.file_name}…`)
    try {
      const { data, error } = await supabase.storage.from(storageBucket).download(item.storage_path)
      if (error || !data) throw error
      const url = URL.createObjectURL(data)
      const link = document.createElement('a')
      link.href = url
      link.download = item.file_name
      link.style.display = 'none'
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 30000)
      showNotice('Download ready.', 'success')
    } catch {
      showNotice('Could not download this file. Please try again.', 'error')
    }
  }

  async function openImage(item: FileItem) {
    if (item.previewUrl) {
      setPreview({ item, url: item.previewUrl, temporary: false })
      return
    }
    if (!supabase) return
    showNotice('Preparing image preview…')
    try {
      const { data, error } = await supabase.storage.from(storageBucket).download(item.storage_path)
      if (error || !data) throw error
      setPreview({ item, url: URL.createObjectURL(data), temporary: true })
    } catch {
      showNotice('Could not open this image. Please try again.', 'error')
    }
  }

  async function copyText(item: TextItem) {
    try {
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable')
        await navigator.clipboard.writeText(item.content)
      } catch {
        const textarea = document.createElement('textarea')
        textarea.value = item.content
        textarea.setAttribute('readonly', '')
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.append(textarea)
        textarea.select()
        const copied = document.execCommand('copy')
        textarea.remove()
        if (!copied) throw new Error('Clipboard unavailable')
      }
      showNotice('Text copied to clipboard.', 'success')
    } catch {
      showNotice('Could not copy this text. Please try again.', 'error')
    }
  }

  async function saveText(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    if (!textContent.trim()) {
      showNotice('Enter some text before saving.', 'error')
      textInputRef.current?.focus()
      return
    }
    setSavingText(true)
    const { data, error } = await supabase
      .from('transfer_texts')
      .insert({ content: textContent })
      .select('*')
      .single()
    setSavingText(false)
    if (error || !data) {
      showNotice('Could not save this text. Please try again.', 'error')
      return
    }
    setTexts((current) => [data as TextItem, ...current])
    setTextContent('')
    setTextOpen(false)
    showNotice('Text saved.', 'success')
  }

  async function deleteItem(item: TransferItem) {
    const label = item.kind === 'file' ? item.file_name : 'this text'
    if (!window.confirm(`Permanently delete ${label}?`)) return
    if (!supabase) return
    setDeletingId(item.id)

    if (item.kind === 'file') {
      const { error: storageError } = await supabase.storage.from(storageBucket).remove([item.storage_path])
      if (storageError) {
        setDeletingId(null)
        showNotice('Could not delete this file. Please try again.', 'error')
        return
      }
    }

    const table = item.kind === 'file' ? 'transfer_files' : 'transfer_texts'
    const { error } = await supabase.from(table).delete().eq('id', item.id)
    setDeletingId(null)
    if (error) {
      showNotice('The item could not be fully deleted. Please try again.', 'error')
      await refreshItems()
      return
    }
    if (item.kind === 'file') setFiles((current) => current.filter((file) => file.id !== item.id))
    else setTexts((current) => current.filter((text) => text.id !== item.id))
    showNotice('Item deleted.', 'success')
  }

  function onDrop(event: React.DragEvent<HTMLElement>) {
    event.preventDefault()
    setDragActive(false)
    if (event.dataTransfer.files.length > 0) void uploadFiles(event.dataTransfer.files)
  }

  const items: TransferItem[] = [
    ...files.map((item) => ({ ...item, kind: 'file' as const })),
    ...texts.map((item) => ({ ...item, kind: 'text' as const })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return (
    <main className="page-shell" onDragOver={(event) => event.preventDefault()}>
      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="Temporary Transfer home">
          <img className="wordmark-icon" src="/transfer-mark.svg" alt="" />
          <span className="wordmark-copy"><strong>Temporary Transfer</strong><span>Quick file handoff</span></span>
        </a>
        <span className="topbar-note"><span className="live-dot" /> NO ACCOUNTS <span className="topbar-divider">/</span> JUST TRANSFER</span>
      </header>

      <section className="intro" id="top">
        <div className="eyebrow"><span className="eyebrow-line" /> ONE SIMPLE PLACE BETWEEN DEVICES</div>
        <h1>Temporary <span>Transfer</span></h1>
        <p>Upload, transfer, download and delete files between your devices.</p>
      </section>

      {!supabase && (
        <aside className="setup-notice" role="status">
          <span className="setup-mark"><CloudUpload size={18} aria-hidden="true" /></span>
          <span><strong>Storage isn’t connected yet.</strong> Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to your <code>.env</code> file, then restart the app.</span>
        </aside>
      )}

      <section
        className={`drop-zone${dragActive ? ' is-dragging' : ''}${!supabase ? ' is-disabled' : ''}`}
        onDragEnter={(event) => { event.preventDefault(); setDragActive(true) }}
        onDragOver={(event) => { event.preventDefault(); setDragActive(true) }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false)
        }}
        onDrop={onDrop}
        aria-disabled={!supabase}
      >
        <div className="drop-icon"><CloudUpload size={25} strokeWidth={1.7} aria-hidden="true" /></div>
        <div className="drop-copy">
          <h2>Drop files here</h2>
          <p>or <button className="browse-button" type="button" disabled={!supabase} onClick={() => fileInputRef.current?.click()}>browse files</button></p>
        </div>
        <div className="drop-side-note"><span>ANY FILE TYPE</span><span>ORIGINAL QUALITY</span></div>
        <input
          ref={fileInputRef}
          className="visually-hidden"
          type="file"
          multiple
          onChange={(event) => {
            if (event.target.files) void uploadFiles(event.target.files)
            event.target.value = ''
          }}
          tabIndex={-1}
          aria-label="Choose files to upload"
        />
        {isUploading && (
          <div className="upload-progress" role="status">
            <LoaderCircle className="spin" size={15} aria-hidden="true" />
            Uploading {uploadDone} of {uploadTotal}…
          </div>
        )}
      </section>

      <div className="quick-actions">
        <span className="quick-actions-label">OR SEND A SNIPPET</span>
        <button className="add-text-button" type="button" disabled={!supabase} onClick={() => setTextOpen(true)}>
          <Plus size={16} aria-hidden="true" /> Add Text
        </button>
      </div>

      <section className="recent-section" aria-labelledby="recent-heading">
        <div className="section-heading">
          <div>
            <div className="eyebrow section-eyebrow"><span className="eyebrow-line" /> YOUR TEMPORARY INBOX</div>
            <h2 id="recent-heading">Recent Items <span className="item-count">{items.length.toString().padStart(2, '0')}</span></h2>
          </div>
          <span className="newest-label">NEWEST FIRST <span aria-hidden="true">↓</span></span>
        </div>

        {loading ? (
          <div className="loading-state"><LoaderCircle className="spin" size={18} aria-hidden="true" /> Loading recent items…</div>
        ) : items.length === 0 ? (
          <div className="empty-state">
            <div className="empty-mark"><Clipboard size={21} strokeWidth={1.5} aria-hidden="true" /></div>
            <p>Nothing here just yet.</p>
            <span>Anything you send will show up here, ready for your other device.</span>
          </div>
        ) : (
          <div className="item-grid">
            {items.map((item) => item.kind === 'file' ? (
              <article className={`item-card file-card${item.previewUrl ? ' has-image' : ''}`} key={`file-${item.id}`}>
                {item.previewUrl ? (
                  <button className="image-preview" type="button" onClick={() => void openImage(item)} aria-label={`Preview ${item.file_name}`}>
                    <img src={item.previewUrl} alt="" loading="lazy" />
                    <span className="image-view-label">VIEW IMAGE</span>
                  </button>
                ) : (
                  <div className="file-symbol"><FileKindIcon item={item} /></div>
                )}
                <div className="item-details">
                  <div className="item-title-row">
                    <h3 title={item.file_name}>{item.file_name}</h3>
                    <span className="file-type-tag">{getFileLabel(item)}</span>
                  </div>
                  <p className="item-subtitle">{formatFileSize(item.file_size)} <span>·</span> {formatUploadTime(item.created_at)}</p>
                  <div className="item-actions">
                    <button type="button" className="primary-action" onClick={() => void downloadFile(item)} disabled={deletingId === item.id}>
                      <ArrowDownToLine size={15} aria-hidden="true" /> Download
                    </button>
                    <button type="button" className="icon-action delete-action" title="Delete file" aria-label={`Delete ${item.file_name}`} disabled={deletingId === item.id} onClick={() => void deleteItem(item)}>
                      {deletingId === item.id ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />}
                    </button>
                  </div>
                </div>
              </article>
            ) : (
              <article className="item-card text-card" key={`text-${item.id}`}>
                <div className="text-symbol"><FileText size={20} aria-hidden="true" /></div>
                <p className="text-preview">{item.content}</p>
                <p className="item-subtitle">Text <span>·</span> {formatUploadTime(item.created_at)}</p>
                <div className="item-actions">
                  <button type="button" className="primary-action" onClick={() => void copyText(item)} disabled={deletingId === item.id}>
                    <Clipboard size={15} aria-hidden="true" /> Copy
                  </button>
                  <button type="button" className="icon-action delete-action" title="Delete text" aria-label="Delete text item" disabled={deletingId === item.id} onClick={() => void deleteItem(item)}>
                    {deletingId === item.id ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={16} />}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer className="page-footer"><span>JUST FOR THE MOMENT.</span><span>Upload · Take · Clear</span></footer>

      {textOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setTextOpen(false) }}>
          <section className="modal text-modal" role="dialog" aria-modal="true" aria-labelledby="text-modal-title">
            <div className="modal-topline"><span>QUICK NOTE</span><button className="icon-action" type="button" aria-label="Close" onClick={() => setTextOpen(false)}><X size={18} /></button></div>
            <h2 id="text-modal-title">Send a little text.</h2>
            <p className="modal-description">It’ll be waiting in Recent Items on your other device.</p>
            <form onSubmit={(event) => void saveText(event)}>
              <label className="visually-hidden" htmlFor="transfer-text">Text to transfer</label>
              <textarea ref={textInputRef} id="transfer-text" value={textContent} onChange={(event) => setTextContent(event.target.value)} placeholder="Paste or type something…" rows={7} />
              <div className="modal-actions">
                <button className="secondary-action" type="button" onClick={() => setTextOpen(false)}>Cancel</button>
                <button className="primary-action save-button" type="submit" disabled={savingText}>
                  {savingText ? <><LoaderCircle className="spin" size={15} /> Saving…</> : <><Check size={15} /> Save text</>}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {preview && (
        <div className="modal-backdrop image-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closePreview() }}>
          <section className="image-modal" role="dialog" aria-modal="true" aria-label={`Image preview: ${preview.item.file_name}`}>
            <div className="image-modal-bar"><span title={preview.item.file_name}>{preview.item.file_name}</span><button className="icon-action" type="button" aria-label="Close image preview" onClick={closePreview}><X size={19} /></button></div>
            <img src={preview.url} alt={preview.item.file_name} />
          </section>
        </div>
      )}

      {notice && <div className={`toast toast-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>{notice.tone === 'success' && <Check size={15} aria-hidden="true" />}{notice.message}</div>}
    </main>
  )
}