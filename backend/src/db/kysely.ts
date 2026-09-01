import { type ColumnType, Kysely, PostgresDialect } from 'kysely'
import { Pool } from 'pg'

type TimestampColumn = ColumnType<Date, Date | string | undefined, Date | string | undefined>
type JsonStringArrayColumn = ColumnType<string[], string[] | string | undefined, string[] | string | undefined>
type JsonObjectColumn = ColumnType<Record<string, unknown>, Record<string, unknown> | string | undefined, Record<string, unknown> | string | undefined>
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
type NullableJsonValueColumn = ColumnType<JsonValue | null, JsonValue | string | null | undefined, never>

export interface UsersTable {
  id: ColumnType<number, never, never>
  username: string
  password_hash: string
  role: 'admin' | 'user'
  menu_perms: JsonStringArrayColumn
  status: number
  created_at: TimestampColumn
  updated_at: TimestampColumn
}

export interface SystemConfigTable {
  key: string
  value: string
  is_secret: boolean
  description: string | null
  created_at: TimestampColumn
  updated_at: TimestampColumn
}

export interface AssetCategoriesTable {
  id: ColumnType<number, never, never>
  project_id: number
  name: string
  sort_order: number
  sync_enabled: boolean
  ark_group_id: string | null
  created_at: TimestampColumn
  updated_at: TimestampColumn
}

export interface AssetsTable {
  id: ColumnType<number, never, never>
  user_id: number
  created_by_user_id: number
  source_project_id: number | null
  name: string
  asset_type: 'Image' | 'Video' | 'Audio'
  category_id: number | null
  sync_mode: 'inherit' | 'enabled' | 'disabled'
  oss_key: string
  ark_group_id: string | null
  ark_asset_id: string | null
  ark_status: string
  ark_error: string | null
  tags: JsonStringArrayColumn
  created_at: TimestampColumn
  updated_at: TimestampColumn
  prompt_content: string | null
}

export interface AtelierCanvasTable {
  id: ColumnType<number, never, never>
  project_id: number
  created_by_user_id: number
  title: string
  document_json: NullableJsonValueColumn
  version: number
  status: 'active' | 'deleted'
  client_stable_id: string | null
  created_at: TimestampColumn
  updated_at: TimestampColumn
  deleted_at: TimestampColumn | null
}

export interface AtelierPromptTable {
  id: ColumnType<number, never, never>
  project_id: number
  title: string
  tags: JsonStringArrayColumn
  current_version: number
  created_by_user_id: number
  updated_by_user_id: number
  status: 'active' | 'deleted'
  client_stable_id: string | null
  created_at: TimestampColumn
  updated_at: TimestampColumn
  deleted_at: TimestampColumn | null
}

export interface AtelierPromptVersionTable {
  project_id: number
  prompt_id: number
  version: number
  content: string
  updated_by_user_id: number
  created_at: TimestampColumn
}

export interface AtelierStorageObjectTable {
  id: ColumnType<number, never, never>
  project_id: number
  created_by_user_id: number
  object_key: string
  category: string
  content_type: string
  bytes: number
  etag: string | null
  metadata: NullableJsonValueColumn
  state: 'active' | 'pending_delete' | 'deleted'
  created_at: TimestampColumn
  updated_at: TimestampColumn
  deleted_at: TimestampColumn | null
}

export interface AtelierCanvasObjectLinkTable {
  project_id: number
  canvas_id: number
  object_id: number
  role: string
  sequence_no: number
  created_at: TimestampColumn
}

export interface AtelierGenerationTaskTable {
  id: ColumnType<number, never, never>
  project_id: number
  created_by_user_id: number
  canvas_id: number | null
  canvas_version: number | null
  prompt_id: number | null
  prompt_version: number | null
  operation: string
  media_type: 'image' | 'video' | 'audio'
  channel_key: string | null
  model: string
  idempotency_key: string
  request_json: NullableJsonValueColumn
  status: string
  progress_percent: number
  provider_task_id: string | null
  error_code: string | null
  error_message: string | null
  created_at: TimestampColumn
  updated_at: TimestampColumn
}

export interface AtelierGenerationOutputTable {
  id: ColumnType<number, never, never>
  project_id: number
  task_id: number
  sequence_no: number
  object_id: number | null
  content_type: string
  bytes: number | null
  status: string
  created_at: TimestampColumn
}

export interface VideoTasksTable {
  id: ColumnType<number, never, never>
  user_id: number
  project_id: number
  ark_task_id: string | null
  idempotency_key: string
  status: 'pending' | 'processing' | 'succeeded' | 'failed'
  model: string
  prompt: string | null
  prompt_raw: string | null
  duration: number | null
  ratio: string | null
  resolution: string | null
  generate_audio: boolean
  provider_key: string | null
  provider_snapshot: JsonObjectColumn
  request_snapshot: JsonObjectColumn
  ark_video_url: string | null
  video_oss_key: string | null
  download_claimed_at: TimestampColumn | null
  download_claim_token: string | null
  completion_tokens: number | null
  total_tokens: number | null
  error_message: string | null
  next_poll_at: TimestampColumn | null
  last_ark_status: string | null
  last_ark_status_changed_at: TimestampColumn | null
  last_polled_at: TimestampColumn | null
  created_at: TimestampColumn
  updated_at: TimestampColumn
}

export interface VideoProvidersTable {
  id: ColumnType<number, never, never>
  provider_key: string
  name: string
  provider_type: string
  endpoint: string
  api_key: string
  enabled: boolean
  is_default: boolean
  capabilities: JsonObjectColumn
  created_at: TimestampColumn
  updated_at: TimestampColumn
}

export interface ProjectsTable {
  id: ColumnType<number, never, never>
  name: string
  code: string
  status: 'active' | 'archived'
  description: string | null
  cover_asset_id: number | null
  created_by: number | null
  created_at: TimestampColumn
  updated_at: TimestampColumn
}

export interface ProjectMembersTable {
  id: ColumnType<number, never, never>
  project_id: number
  user_id: number
  project_role: 'manager' | 'member' | 'viewer'
  status: 'active' | 'inactive'
  created_by: number | null
  created_at: TimestampColumn
  updated_at: TimestampColumn
}

export interface ProjectAssetsTable {
  id: ColumnType<number, never, never>
  project_id: number
  asset_id: number
  category_id: number | null
  relation_type: 'primary' | 'linked'
  created_by: number | null
  created_at: TimestampColumn
}

export interface VideoTaskAssetsTable {
  id: ColumnType<number, never, never>
  video_task_id: number
  asset_id: number
  role: 'first_frame' | 'last_frame' | 'reference_image' | 'reference_video' | 'reference_audio'
  created_at: TimestampColumn
}

export interface VideoGenerationLogsTable {
  id: ColumnType<number, never, never>
  video_task_id: number | null
  project_id: number
  user_id: number | null
  trace_id: string
  stage: string
  action: string
  status: 'started' | 'succeeded' | 'failed' | 'info'
  message: string
  request_payload: NullableJsonValueColumn
  response_payload: NullableJsonValueColumn
  duration_ms: number | null
  error_message: string | null
  created_at: TimestampColumn
}

export interface UserApiKeysTable {
  id: ColumnType<number, never, never>
  user_id: number
  provider_key: string
  api_key_encrypted: string
  enabled: boolean
  created_at: TimestampColumn
  updated_at: TimestampColumn
}

export interface Database {
  users: UsersTable
  system_config: SystemConfigTable
  projects: ProjectsTable
  project_members: ProjectMembersTable
  project_assets: ProjectAssetsTable
  asset_categories: AssetCategoriesTable
  assets: AssetsTable
  video_tasks: VideoTasksTable
  video_providers: VideoProvidersTable
  video_task_assets: VideoTaskAssetsTable
  video_generation_logs: VideoGenerationLogsTable
  user_api_keys: UserApiKeysTable
  atelier_canvases: AtelierCanvasTable
  atelier_prompts: AtelierPromptTable
  atelier_prompt_versions: AtelierPromptVersionTable
  atelier_storage_objects: AtelierStorageObjectTable
  atelier_canvas_object_links: AtelierCanvasObjectLinkTable
  atelier_generation_tasks: AtelierGenerationTaskTable
  atelier_generation_outputs: AtelierGenerationOutputTable
}

const createPool = (): Pool =>
  new Pool({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? '5432'),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME ?? 'narrix_dev',
    max: 10,
  })

export const createDb = (): Kysely<Database> =>
  new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: createPool(),
    }),
  })

export const db = createDb()
