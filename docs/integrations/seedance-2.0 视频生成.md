> ## Documentation Index
> Fetch the complete documentation index at: https://docs.toapis.com/llms.txt
> Use this file to discover all available pages before exploring further.

# seedance-2 视频生成

> 使用 seedance-2、seedance-2-fast 与 seedance-2-mini 模型生成视频

* 支持 `seedance-2`、`seedance-2-fast` 与 `seedance-2-mini`
* 支持文生视频、首帧/首尾帧图生视频与多模态参考生视频；`seedance-2-mini` 的首尾帧与音频开关能力也已开放
* 支持参考图、参考视频、参考音频联合控制；`seedance-2-mini` 最多支持 `9` 张图、`3` 条视频、`3` 条音频
* 异步任务管理，提交后返回 `generation.task`，完成结果通过任务查询接口获取

## Authorizations

<ParamField header="Authorization" type="string" required>
  所有接口均需要使用 Bearer Token 进行认证

  获取 API Key：访问 [API Key 管理页面](https://toapis.com/console/token) 获取您的 API Key

  使用时在请求头中添加：

  ```
  Authorization: Bearer YOUR_API_KEY
  ```
</ParamField>

## Body

<ParamField body="model" type="string" default="seedance-2" required>
  视频生成模型名称

  可用模型：

  * `seedance-2` - 标准版，适合更高质量输出与更完整的 Seedance 2 能力
  * `seedance-2-fast` - 快速版，适合预览、迭代和更低延迟场景
  * `seedance-2-mini` - 轻量版，适合低成本草稿和多模态参考工作流，当前固定单次生成 `1` 个结果
</ParamField>

<ParamField body="prompt" type="string">
  视频内容描述

  支持中英文输入。建议明确描述场景、镜头运动、主体动作、风格和声音氛围。

  建议：

  * 中文尽量控制在 `500` 字以内
  * 英文尽量控制在 `1000` 词以内
  * 需要引用参考素材时，使用“图片1 / 视频1 / 音频1”的方式指代
</ParamField>

<ParamField body="client_business_id" type="string">
  客户侧业务 ID，例如订单号、流水号或您系统内的任务 ID。提交后会随任务保存，后续可用该 ID 查询状态：
  `GET /v1/videos/generations/{client_business_id}`。

  也兼容放在 `metadata.client_business_id` 中，但推荐使用顶层字段。
</ParamField>

<ParamField body="duration" type="integer" default={0}>
  视频时长（秒）

  取值规则：

  * `seedance-2`：`4-15`
  * `seedance-2-fast`：`4-15`
  * `seedance-2-mini`：`4-15`
  * `0`：自动时长（仅 `seedance-2` / `seedance-2-fast`）
  * `-1`：自动时长（仅 `seedance-2` / `seedance-2-fast`）
</ParamField>

<ParamField body="aspect_ratio" type="string">
  视频宽高比

  可选项：

  * `21:9`
  * `16:9`
  * `4:3`
  * `1:1`
  * `3:4`
  * `9:16`
  * `adaptive`

  建议优先使用 `aspect_ratio` 作为对外字段。`adaptive` 表示由上游根据输入素材自动选择合适比例。
</ParamField>

<ParamField body="image_urls" type="string[]">
  兼容模式下的图片 URL 数组

  推荐优先使用 `image_with_roles`，这样可以显式声明 `first_frame`、`last_frame` 或 `reference_image`。

  兼容规则：

  * 传 1 张图时，通常按首帧图处理
  * 传多张图时，角色推断会带来歧义，不建议用于新接入

  <Warning>
    - `image_urls` 不应与 `image_with_roles` 同时使用。
    - 新接入建议使用 `image_with_roles` 显式声明图片用途，避免兼容推断带来的歧义。
  </Warning>
</ParamField>

<ParamField body="image_with_roles" type="array">
  带角色的图片数组

  支持场景：

  * `seedance-2` / `seedance-2-fast` / `seedance-2-mini`
    * 首帧图生视频：`first_frame` 1 张
    * 首尾帧图生视频：`first_frame` 1 张 + `last_frame` 1 张
    * 多模态参考生视频：`reference_image` 1-9 张

  <Expandable title="字段说明">
    <ParamField body="url" type="string" required>
      图片 URL、Base64 数据或已上传素材 URI

      支持：

      * `https://...`
      * `data:image/<format>;base64,...`
      * `asset://<ASSET_ID>`
    </ParamField>

    <ParamField body="role" type="string" required>
      图片角色

      可选项：

      * `first_frame` - 首帧图
      * `last_frame` - 尾帧图
      * `reference_image` - 参考图
    </ParamField>
  </Expandable>

  <Warning>
    * `first_frame` 最多 1 张
    * `last_frame` 最多 1 张
    * `reference_image` 最多 `9` 张
    * 首帧/首尾帧模式不能与参考模式混用
    * `seedance-2-mini` 同样支持 `first_frame`、`last_frame` 与 `reference_image`
  </Warning>
</ParamField>

<ParamField body="video_with_roles" type="array">
  带角色的视频数组

  当前仅支持多模态参考模式使用 `reference_video`。

  <Expandable title="字段说明">
    <ParamField body="url" type="string" required>
      视频 URL 或已上传素材 URI

      支持：

      * `https://...`
      * `asset://<ASSET_ID>`
    </ParamField>

    <ParamField body="role" type="string" required>
      固定为：

      * `reference_video`
    </ParamField>
  </Expandable>

  限制：

  * `seedance-2-mini` 最多 `3` 条参考视频
</ParamField>

<ParamField body="audio_with_roles" type="array">
  带角色的音频数组

  当前仅支持多模态参考模式使用 `reference_audio`。

  <Expandable title="字段说明">
    <ParamField body="url" type="string" required>
      音频 URL、Base64 数据或已上传素材 URI

      支持：

      * `https://...`
      * `data:audio/<format>;base64,...`
      * `asset://<ASSET_ID>`
    </ParamField>

    <ParamField body="role" type="string" required>
      固定为：

      * `reference_audio`
    </ParamField>
  </Expandable>

  限制：

  * `seedance-2-mini` 最多 `3` 段参考音频

  <Warning>
    `audio_with_roles` 不能单独使用，至少还需要一个图片或视频参考输入。
  </Warning>
</ParamField>

<ParamField body="resolution" type="string" default="720p">
  视频分辨率

  可选项：

  * `seedance-2`：`480p`、`720p`、`1080p`、`4k`
  * `seedance-2-fast`：`480p`、`720p`
  * `seedance-2-mini`：`480p`、`720p`
</ParamField>

<ParamField body="generate_audio" type="boolean" default={true}>
  是否生成同步音频

  * `true`：生成带音频的视频
  * `false`：生成无声视频

  `seedance-2-mini` 同样支持该字段。
</ParamField>

<ParamField body="return_last_frame" type="boolean" default={false}>
  是否返回生成视频的尾帧图像。

  设置为 `true` 后，任务完成时可从状态查询响应的 `result.data[0].last_frame_url` 获取尾帧图像 URL。
</ParamField>

<ParamField body="tools" type="array">
  配置模型可调用的工具。当前 Seedance 2 系列仅支持联网搜索：

  ```json theme={null}
  [{ "type": "web_search" }]
  ```

  启用后，模型会根据提示词自主判断是否搜索互联网内容。实际搜索次数通过状态查询响应的 `usage.tool_usage.web_search` 获取，值为 `0` 表示未执行搜索。

  <Warning>
    `tools` 仅支持纯文生视频请求，不能与图片、视频或音频输入同时使用。
  </Warning>
</ParamField>

<ParamField body="seed" type="integer">
  随机种子，用于控制生成随机性
</ParamField>

<ParamField body="callback_url" type="string">
  ToAPIs 标准任务完成回调地址。必须先在 Token 中配置默认地址和签名密钥；请求级地址仅允许同源覆盖。详见 [任务 Webhook](/docs/cn/api-reference/webhooks/task-webhooks)。
</ParamField>

<ParamField body="trace_id" type="string">
  调用方自定义透传 ID

  调用方追踪字段，与是否启用 Webhook 无关。
</ParamField>

## 使用已入库素材

如果你已经通过私域素材接口完成了素材入库，并拿到了可用的 `asset_id`，那么在视频生成接口中，你不需要再传原始素材 URL，而是直接使用：

* `asset://<ASSET_ID>`

适用范围：

* 虚拟人像素材
* 真人人像素材
* 已经处理完成并处于 `active` 状态的图片、视频、音频素材

使用前你需要先完成以下流程：

1. 先在素材接口中创建素材组或完成真人认证
2. 上传素材并拿到 `asset_id`
3. 轮询素材状态，确认已经变为 `active`
4. 在视频生成请求中把素材地址写成 `asset://<ASSET_ID>`

你可以参考这两组素材文档完成入库：

* [虚拟人像素材](./private-avatar)
* [真人人像素材](./real-avatar)

### 在生成请求中的写法

图片素材可用于：

* `first_frame`
* `last_frame`
* `reference_image`

视频素材可用于：

* `reference_video`

音频素材可用于：

* `reference_audio`

最小示例：

```json theme={null}
{
  "model": "seedance-2-mini",
  "prompt": "让图片1中的人物站在落地窗前缓慢转身，镜头轻微推进，保持人物服装和面部特征一致",
  "image_with_roles": [
    {
      "url": "asset://asset_img_01KXXXXXXX",
      "role": "reference_image"
    }
  ]
}
```

包含视频和音频参考的示例：

```json theme={null}
{
  "model": "seedance-2-mini",
  "prompt": "保持图片1中的人物形象，参考视频1的镜头运动和音频1的节奏氛围，生成一段室内口播视频",
  "image_with_roles": [
    {
      "url": "asset://asset_img_01KXXXXXXX",
      "role": "reference_image"
    }
  ],
  "video_with_roles": [
    {
      "url": "asset://asset_vid_01KXXXXXXX",
      "role": "reference_video"
    }
  ],
  "audio_with_roles": [
    {
      "url": "asset://asset_aud_01KXXXXXXX",
      "role": "reference_audio"
    }
  ]
}
```

<Warning>
  只有状态为 `active` 的素材才能用于视频生成。

  如果你传入了 `asset://<ASSET_ID>` 但素材仍在 `processing` 或已经 `failed`，生成请求会失败或无法达到预期效果。
</Warning>

## 输入组合规则

支持的典型输入组合：

* 纯文本：文生视频
* 文本 + 1 张首帧图：首帧图生视频
* 文本 + 首帧图 + 尾帧图：首尾帧图生视频
* 文本 + 参考图：多模态参考生视频
* 文本 + 参考视频：视频参考生视频
* 文本 + 参考图 + 参考音频：多模态参考生视频
* 文本 + 参考图 + 参考视频 + 参考音频：多模态参考生视频

<Warning>
  三种模式互斥：

  * 首帧图生视频
  * 首尾帧图生视频
  * 多模态参考生视频

  `seedance-2-mini` 也支持首帧 / 首尾帧模式；需要首尾帧控制时请使用 `image_with_roles` 显式传入 `first_frame` / `last_frame`。
</Warning>

## 能力与约束

| 项目        | seedance-2                                       | seedance-2-fast                                  | seedance-2-mini                                  |
| --------- | ------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------ |
| 主要定位      | 更高质量与更长时长                                        | 更快生成与更低延迟                                        | 低成本草稿与多模态参考                                      |
| 时长        | `4-15` 秒，支持自动时长                                  | `4-15` 秒，支持自动时长                                  | `4-15` 秒                                         |
| 分辨率       | `480p` / `720p` / `1080p` / `4k`                 | `480p` / `720p`                                  | `480p` / `720p`                                  |
| 图片角色      | `first_frame` / `last_frame` / `reference_image` | `first_frame` / `last_frame` / `reference_image` | `first_frame` / `last_frame` / `reference_image` |
| 视频角色      | `reference_video`                                | `reference_video`                                | `reference_video`                                |
| 音频角色      | `reference_audio`                                | `reference_audio`                                | `reference_audio`                                |
| 首尾帧模式     | 支持                                               | 支持                                               | 支持                                               |
| 参考图上限     | `9`                                              | `9`                                              | `9`                                              |
| 参考视频上限    | 以实际通道能力为准                                        | 以实际通道能力为准                                        | `3`                                              |
| 参考音频上限    | 以实际通道能力为准                                        | 以实际通道能力为准                                        | `3`                                              |
| 同步音频      | `generate_audio`                                 | `generate_audio`                                 | `generate_audio`                                 |
| ToAPIs 回调 | `callback_url`（`trace_id` 可选追踪）                  | `callback_url`（`trace_id` 可选追踪）                  | `callback_url`（`trace_id` 可选追踪）                  |

<Note>
  `seedance-2-mini` 当前固定单次生成 `1` 个结果，不暴露 `count` / `n`。首尾帧控制请通过 `image_with_roles` 的 `first_frame` / `last_frame` 表达。
</Note>

## Response

<ResponseField name="id" type="string">
  任务 ID，用于查询任务状态。
</ResponseField>

<ResponseField name="client_business_id" type="string">
  客户侧业务 ID。仅当请求中传入 `client_business_id` 时返回。
</ResponseField>

<ResponseField name="object" type="string">
  对象类型，固定为 `generation.task`。
</ResponseField>

<ResponseField name="model" type="string">
  本次请求使用的模型名称。
</ResponseField>

<ResponseField name="status" type="string">
  任务状态：`queued`、`in_progress`、`completed` 或 `failed`。
</ResponseField>

<ResponseField name="progress" type="integer">
  任务进度百分比（`0-100`）。
</ResponseField>

<ResponseField name="created_at" type="integer">
  任务创建时间戳。
</ResponseField>

<Info>
  提交接口返回的是基础任务对象；当任务完成后，请使用 [获取视频任务状态](../../tasks/video-status) 获取 `completed_at`、`expires_at` 以及 `result.type = "video"` / `result.data[].url` / `result.data[].format`。启用 `return_last_frame` 时，尾帧 URL 位于 `result.data[0].last_frame_url`；启用 `web_search` 时，搜索次数位于 `usage.tool_usage.web_search`。
</Info>

<RequestExample>
  ```bash cURL（seedance-2-mini 多模态参考） theme={null}
  curl --request POST \
    --url https://toapis.com/v1/videos/generations \
    --header 'Authorization: Bearer <token>' \
    --header 'Content-Type: application/json' \
    --data '{
      "model": "seedance-2-mini",
      "client_business_id": "order_20260616_001",
      "prompt": "保持图片1中的人物形象，参考视频1的运镜和音频1的节奏，生成一段室内产品口播短视频。",
      "duration": 10,
      "aspect_ratio": "16:9",
      "image_with_roles": [
        {"url": "https://example.com/ref-image-1.jpg", "role": "reference_image"}
      ],
      "video_with_roles": [
        {"url": "https://example.com/ref-video-1.mp4", "role": "reference_video"}
      ],
      "audio_with_roles": [
        {"url": "https://example.com/ref-audio-1.mp3", "role": "reference_audio"}
      ],
      "resolution": "480p"
    }'
  ```

  ```bash cURL（首尾帧图生视频） theme={null}
  curl --request POST \
    --url https://toapis.com/v1/videos/generations \
    --header 'Authorization: Bearer <token>' \
    --header 'Content-Type: application/json' \
    --data '{
      "model": "seedance-2",
      "prompt": "镜头从窗边花束慢慢推到餐桌中央，画面色调温暖柔和。",
      "duration": 5,
      "aspect_ratio": "16:9",
      "image_with_roles": [
        {"url": "https://example.com/first-frame.png", "role": "first_frame"},
        {"url": "https://example.com/last-frame.png", "role": "last_frame"}
      ],
      "resolution": "720p",
      "generate_audio": false
    }'
  ```

  ```bash cURL（文生视频） theme={null}
  curl --request POST \
    --url https://toapis.com/v1/videos/generations \
    --header 'Authorization: Bearer <token>' \
    --header 'Content-Type: application/json' \
    --data '{
      "model": "seedance-2",
      "prompt": "微距镜头拍摄一只玻璃蛙停在叶片上，镜头缓慢切到透明腹部与跳动心脏，纪录片风格。",
      "duration": 11,
      "aspect_ratio": "16:9",
      "resolution": "720p",
      "generate_audio": true
    }'
  ```

  ```bash cURL（Fast 版本快速预览） theme={null}
  curl --request POST \
    --url https://toapis.com/v1/videos/generations \
    --header 'Authorization: Bearer <token>' \
    --header 'Content-Type: application/json' \
    --data '{
      "model": "seedance-2-fast",
      "prompt": "一只柴犬在雨后的霓虹街头奔跑，地面倒映彩色灯光。",
      "duration": 5,
      "aspect_ratio": "16:9",
      "resolution": "720p"
    }'
  ```

  ```python Python theme={null}
  import requests

  response = requests.post(
      "https://toapis.com/v1/videos/generations",
      headers={
          "Authorization": "Bearer your-ToAPIs-key",
          "Content-Type": "application/json",
      },
      json={
          "model": "seedance-2-mini",
          "prompt": "保持人物形象一致，参考图片和视频的节奏，生成一段简短室内广告视频",
          "duration": 8,
          "aspect_ratio": "16:9",
          "resolution": "720p",
          "image_with_roles": [
              {"url": "https://example.com/ref.png", "role": "reference_image"}
          ],
          "video_with_roles": [
              {"url": "https://example.com/ref.mp4", "role": "reference_video"}
          ],
      },
  )

  print(response.json())
  ```
</RequestExample>

<ResponseExample>
  ```json 200 theme={null}
  {
    "id": "tsk_vid_xxx",
    "client_business_id": "order_20260616_001",
    "object": "generation.task",
    "model": "seedance-2-mini",
    "status": "in_progress",
    "progress": 10,
    "created_at": 1781577600
  }
  ```
</ResponseExample>
