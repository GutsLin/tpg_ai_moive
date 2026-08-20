> ## Documentation Index
> Fetch the complete documentation index at: https://docs.toapis.com/llms.txt
> Use this file to discover all available pages before exploring further.

# seedance-2.5 视频生成

> 使用 seedance-2-5 模型生成视频

Seedance 2.5 的公共模型名为 `seedance-2-5`，火山引擎上游模型 ID 为 `doubao-seedance-2-5-260628`。

* 支持文生视频、首帧/首尾帧图生视频、视频编辑、视频延长和多模态参考生视频。
* 支持图片、视频、音频参考，也支持纯音频参考。
* 接口为异步任务：提交后返回 `generation.task`，完成后通过任务状态接口获取视频。

## Authorizations

<ParamField header="Authorization" type="string" required>
  所有请求都需要 Bearer Token。请在 [API Key 管理页面](https://toapis.com/console/token) 获取密钥，并在请求头中添加：

  ```
  Authorization: Bearer YOUR_API_KEY
  ```
</ParamField>

## Body

<ParamField body="model" type="string" default="seedance-2-5" required>
  ToAPIs 公共模型名，固定使用 `seedance-2-5`。
</ParamField>

<ParamField body="prompt" type="string">
  描述场景、镜头运动、主体动作、风格和声音氛围。引用素材时使用“图片1”“视频1”“音频1”等标签。
</ParamField>

<ParamField body="video_operation" type="string" default="generate">
  视频业务类型，可选 `generate`、`edit` 或 `extend`。编辑和延长至少需要一个 `video_with_roles`；延长需要正数 `duration`。三种操作共用本接口。
</ParamField>

<ParamField body="client_business_id" type="string">
  客户侧订单号或业务任务 ID。提交后会随任务保存，也可用 `GET /v1/videos/generations/{client_business_id}` 查询。
</ParamField>

<ParamField body="duration" type="integer">
  视频时长（秒），官方范围为 `4`–`30`；使用 `-1` 表示自动时长。编辑、延长以及上游要求的首尾帧任务需使用 `-1`。
</ParamField>

<ParamField body="aspect_ratio" type="string">
  可选：`21:9`、`16:9`、`4:3`、`1:1`、`3:4`、`9:16`、`adaptive`。

  编辑、视频延长和首尾帧任务按上游要求使用 `adaptive`；也可让输入素材决定比例。
</ParamField>

<ParamField body="image_urls" type="string[]">
  兼容模式的图片 URL 数组。新接入建议使用 `image_with_roles` 明确每张图的用途；两个字段不能同时传。
</ParamField>

<ParamField body="image_with_roles" type="array">
  带角色的图片数组，每项包含必填 `url` 和 `role`。角色可为 `first_frame`、`last_frame` 或 `reference_image`。最多 30 张图片；首尾帧模式与参考图模式不能混用。
</ParamField>

<ParamField body="video_with_roles" type="array">
  参考视频数组，每项包含必填 `url`，角色固定为 `reference_video`。最多 10 段视频。
</ParamField>

<ParamField body="audio_with_roles" type="array">
  参考音频数组，每项包含必填 `url`，角色固定为 `reference_audio`。最多 10 段音频，也支持纯音频参考。
</ParamField>

<ParamField body="resolution" type="string">
  分辨率：`480p` 或 `720p`。
</ParamField>

<ParamField body="output_format" type="string" default="mp4">
  支持 `mp4` 和 `mov`。
</ParamField>

<ParamField body="generate_audio" type="boolean" default={true}>
  是否生成同步音频。
</ParamField>

<ParamField body="return_last_frame" type="boolean" default={false}>
  是否在完成结果中返回生成视频的尾帧图片。
</ParamField>

<ParamField body="tools" type="array">
  可选工具：`[{ "type": "web_search" }]`。仅适用于纯文生视频，不能与图片、视频或音频输入同时使用。
</ParamField>

<ParamField body="callback_url" type="string">
  ToAPIs 任务完成回调地址，详见[任务 Webhook](/docs/cn/api-reference/webhooks/task-webhooks)。
</ParamField>

<ParamField body="trace_id" type="string">
  调用方自定义的链路追踪 ID。
</ParamField>

## 参考素材限制

总计最多 50 个参考素材：图片 30 张、视频 10 段、音频 10 段。请使用显式角色，避免首帧/尾帧与参考素材被错误推断。

<Warning>
  非法任务组合可能在异步阶段才失败，并返回 `InvalidParameter.TaskTypeConstraint`。编辑、延长和首尾帧任务按上游要求将 `aspect_ratio` 设为 `adaptive`。
</Warning>

## Response

<ResponseField name="id" type="string">任务 ID，用于查询状态。</ResponseField>
<ResponseField name="client_business_id" type="string">请求传入该字段时返回。</ResponseField>
<ResponseField name="object" type="string">固定为 `generation.task`。</ResponseField>
<ResponseField name="model" type="string">本次请求的模型名。</ResponseField>
<ResponseField name="status" type="string">`queued`、`in_progress`、`completed` 或 `failed`。</ResponseField>
<ResponseField name="progress" type="integer">`0`–`100` 的任务进度。</ResponseField>
<ResponseField name="created_at" type="integer">创建时间戳。</ResponseField>

<RequestExample>
  ```bash cURL theme={null}
  curl --request POST \
    --url https://toapis.com/v1/videos/generations \
    --header 'Authorization: Bearer <token>' \
    --header 'Content-Type: application/json' \
    --data '{
      "model": "seedance-2-5",
      "prompt": "电影感产品特写，镜头缓慢推进，保留自然室内声音。",
      "duration": 10,
      "aspect_ratio": "16:9",
      "resolution": "720p",
      "generate_audio": true
    }'
  ```

  ```json 多模态参考请求 theme={null}
  {
    "model": "seedance-2-5",
    "prompt": "使用图片1中的人物、视频1的运镜和音频1的节奏。",
    "duration": 12,
    "aspect_ratio": "16:9",
    "image_with_roles": [{"url": "https://example.com/ref.png", "role": "reference_image"}],
    "video_with_roles": [{"url": "https://example.com/motion.mp4", "role": "reference_video"}],
    "audio_with_roles": [{"url": "https://example.com/rhythm.mp3", "role": "reference_audio"}]
  }
  ```
</RequestExample>

<ResponseExample>
  ```json 200 theme={null}
  {
    "id": "tsk_vid_xxx",
    "object": "generation.task",
    "model": "seedance-2-5",
    "status": "in_progress",
    "progress": 10,
    "created_at": 1781577600
  }
  ```
</ResponseExample>
