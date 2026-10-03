export type FileItem = {
  id: string
  file_name: string
  file_type: string
  file_size: number
  storage_path: string
  created_at: string
  previewUrl?: string
}

export type TextItem = {
  id: string
  content: string
  created_at: string
}

export type TransferItem =
  | (FileItem & { kind: 'file' })
  | (TextItem & { kind: 'text' })

export type Notice = {
  message: string
  tone: 'success' | 'error' | 'info'
}