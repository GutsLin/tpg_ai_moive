import { Alert, Button, Card, Divider, Space, Typography } from 'antd'
import { Link } from 'react-router-dom'

import { useDocumentTitle } from '../../hooks/useDocumentTitle'

const pageStyle = {
  minHeight: '100vh',
  padding: 'clamp(20px, 4vw, 40px)',
  background:
    'radial-gradient(circle at top left, rgba(15,118,110,0.18), transparent 28%), radial-gradient(circle at bottom right, rgba(180,83,9,0.14), transparent 30%), linear-gradient(160deg, #f7f4ee 0%, #f3efe6 35%, #ebe5d8 100%)',
}

const shellStyle = {
  maxWidth: 1120,
  margin: '0 auto',
  display: 'grid',
  gap: 20,
}

const cardStyle = {
  borderRadius: 24,
  border: '1px solid rgba(15, 23, 42, 0.08)',
  boxShadow: '0 18px 40px rgba(15, 23, 42, 0.06)',
}

const SectionTitle = ({ id, children }: { id?: string; children: React.ReactNode }) => (
  <Typography.Title id={id} level={3} style={{ marginBottom: 12 }}>
    {children}
  </Typography.Title>
)

export const SetupHelpPage = () => {
  useDocumentTitle('Narrix 安装帮助中心')

  return (
    <div style={pageStyle}>
      <div style={shellStyle}>
        <Card style={cardStyle}>
          <div style={{ display: 'grid', gap: 16 }}>
            <Typography.Text
              style={{
                display: 'inline-flex',
                padding: '6px 12px',
                borderRadius: 999,
                background: 'rgba(15,118,110,0.10)',
                color: '#0f766e',
                fontWeight: 600,
                width: 'fit-content',
              }}
            >
              Narrix · 安装帮助中心
            </Typography.Text>
            <div>
              <Typography.Title level={2} style={{ marginBottom: 8 }}>
                Narrix 安装帮助中心
              </Typography.Title>
              <Typography.Paragraph style={{ maxWidth: 760, marginBottom: 0, color: '#475569' }}>
                这份页面是给客户和交付同学直接照着操作的中文教程。重点把 Step3 里最容易卡住的
                阿里云 OSS STS Role ARN、火山视频配置、火山素材配置全部拆成可执行步骤。
              </Typography.Paragraph>
            </div>
            <Space wrap>
              <Button type="primary">
                <Link to="/setup">返回安装向导</Link>
              </Button>
              <Typography.Link href="#oss-role-arn">跳到 OSS STS Role ARN 教程</Typography.Link>
            </Space>
          </div>
        </Card>

        <Card style={cardStyle}>
          <SectionTitle>准备顺序</SectionTitle>
          <Typography.Paragraph>建议按这个顺序准备，最省时间：</Typography.Paragraph>
          <Typography.Paragraph>1. 阿里云：RAM 用户 AccessKey → OSS Bucket / Region → STS 角色 ARN</Typography.Paragraph>
          <Typography.Paragraph>2. 火山视频：方舟 API Key → Endpoint</Typography.Paragraph>
          <Typography.Paragraph>3. 火山素材：Access Key / Secret Key → 在 Narrix 安装页加载或新建默认素材组</Typography.Paragraph>
          <Alert
            showIcon
            type="info"
            message="先把阿里云权限链路打通"
            description="客户最容易卡在 STS 角色没授权、信任策略不对、Role ARN 复制错这三件事。下面的 OSS STS Role ARN 教程就是专门解决这个。"
          />
        </Card>

        <Card style={cardStyle}>
          <SectionTitle>OSS 基础信息</SectionTitle>
          <Typography.Title level={4}>1. OSS AccessKey</Typography.Title>
          <Typography.Paragraph>
            登录阿里云控制台后，进入 RAM。给 Narrix 单独创建一个 RAM 用户，不要直接使用主账号。
            在这个 RAM 用户详情页里创建 AccessKey，拿到两项值：
          </Typography.Paragraph>
          <Typography.Paragraph>1. AccessKey ID，填到 Step3 的 `OSS Access Key ID`</Typography.Paragraph>
          <Typography.Paragraph>2. AccessKey Secret，填到 Step3 的 `OSS Access Key Secret`</Typography.Paragraph>
          <Typography.Paragraph>
            官方文档：
            <Typography.Link
              href="https://help.aliyun.com/zh/ram/user-guide/create-an-accesskey-pair"
              target="_blank"
              rel="noreferrer"
            >
              阿里云 AccessKey 官方文档
            </Typography.Link>
          </Typography.Paragraph>

          <Divider />

          <Typography.Title level={4}>2. OSS Bucket / Region</Typography.Title>
          <Typography.Paragraph>
            进入 OSS 控制台，打开客户要给 Narrix 使用的 Bucket 详情页：
          </Typography.Paragraph>
          <Typography.Paragraph>1. Bucket 名称，填到 `OSS Bucket`</Typography.Paragraph>
          <Typography.Paragraph>
            2. 地域编码，填到 `OSS Region`，通常长这样：`oss-cn-shanghai`
          </Typography.Paragraph>
          <Typography.Paragraph>注意，这里不要填完整域名，也不要填 `https://` 开头的地址。</Typography.Paragraph>
          <Typography.Paragraph>
            官方文档：
            <Typography.Link
              href="https://help.aliyun.com/zh/oss/user-guide/regions-and-endpoints"
              target="_blank"
              rel="noreferrer"
            >
              阿里云 Region 与 Endpoint 说明
            </Typography.Link>
          </Typography.Paragraph>
        </Card>

        <Card style={cardStyle}>
          <SectionTitle id="oss-role-arn">OSS STS Role ARN 详细教程</SectionTitle>
          <Alert
            showIcon
            type="warning"
            message="这一步最容易出错"
            description="你不只是要创建角色，还要同时处理信任策略和权限策略。只复制 ARN 不授权，Narrix 依然拿不到临时凭证。"
            style={{ marginBottom: 16 }}
          />

          <Typography.Title level={4}>步骤 1：创建一个给 Narrix 使用的 RAM 角色</Typography.Title>
          <Typography.Paragraph>
            进入阿里云 RAM 控制台，找到“角色”，新建角色。建议命名成 `narrix-oss-sts-role`
            之类，后续客户一眼能看出来用途。
          </Typography.Paragraph>

          <Typography.Title level={4}>步骤 2：给这个角色配置可被 AssumeRole 的信任关系</Typography.Title>
          <Typography.Paragraph>
            这一步的目标是让 Narrix 后端能通过 STS 临时扮演这个角色。客户如果自己做策略，最常见的问题是信任主体配置错了。
          </Typography.Paragraph>
          <Typography.Paragraph>
            如果客户是用单独 RAM 用户的 AccessKey 调 Narrix，这个角色的信任主体通常应该允许该 RAM 用户或账号体系发起 `AssumeRole`。
          </Typography.Paragraph>

          <Typography.Title level={4}>步骤 3：给角色授权 OSS 所需权限</Typography.Title>
          <Typography.Paragraph>至少要保证 Narrix 能完成这两类动作：</Typography.Paragraph>
          <Typography.Paragraph>1. 上传素材到指定 Bucket</Typography.Paragraph>
          <Typography.Paragraph>2. 生成临时访问链接或读取对象元信息</Typography.Paragraph>
          <Typography.Paragraph>
            如果客户权限收得比较严，建议直接按 Narrix 的目标 Bucket 做最小授权，不要先给全局管理员权限。
          </Typography.Paragraph>

          <Typography.Title level={4}>步骤 4：复制 Role ARN</Typography.Title>
          <Typography.Paragraph>
            进入刚创建好的角色详情页，在基本信息区域找到 ARN，格式通常类似：
          </Typography.Paragraph>
          <pre
            style={{
              padding: 16,
              borderRadius: 16,
              background: '#0f172a',
              color: '#e2e8f0',
              overflowX: 'auto',
              margin: '0 0 16px',
            }}
          >
{`acs:ram::<阿里云账号ID>:role/<角色名>`}
          </pre>
          <Typography.Paragraph>把这整串完整复制到 Step3 的 `OSS STS Role ARN`。</Typography.Paragraph>

          <Typography.Title level={4}>步骤 5：如果校验失败，优先排查这几个点</Typography.Title>
          <Typography.Paragraph>1. 复制的是角色 ARN，不是 RAM 用户 ARN</Typography.Paragraph>
          <Typography.Paragraph>2. 角色本身有 OSS 权限，但信任策略没有允许被 AssumeRole</Typography.Paragraph>
          <Typography.Paragraph>3. Bucket 所在 Region 填错了，导致看起来像角色有问题</Typography.Paragraph>
          <Typography.Paragraph>4. 客户给 Narrix 的 AccessKey 本身没有调用 STS 的权限</Typography.Paragraph>

          <Typography.Paragraph>
            官方补充文档：
            <Typography.Link
              href="https://help.aliyun.com/zh/ram/support/faq-about-ram-roles-and-sts-tokens"
              target="_blank"
              rel="noreferrer"
            >
              阿里云 RAM 角色 ARN 与 STS 常见问题
            </Typography.Link>
          </Typography.Paragraph>
        </Card>

        <Card style={cardStyle}>
          <SectionTitle>火山视频配置</SectionTitle>
          <Typography.Paragraph>
            `火山 Bearer Token` 这里填的是火山方舟的 API Key。Narrix 会自动把它按 Bearer 方式带到请求头里。
          </Typography.Paragraph>
          <Typography.Paragraph>
            `火山视频 Endpoint` 没有特殊网关时，直接使用默认值：
            `https://ark.cn-beijing.volces.com/api/v3`
          </Typography.Paragraph>
          <Typography.Paragraph>
            官方文档：
            <Typography.Link
              href="https://www.volcengine.com/docs/82379/1541594"
              target="_blank"
              rel="noreferrer"
            >
              火山方舟 API Key 官方文档
            </Typography.Link>
          </Typography.Paragraph>
        </Card>

        <Card style={cardStyle}>
          <SectionTitle>火山素材配置</SectionTitle>
          <Typography.Paragraph>
            这里和火山视频不一样，走的是 OpenAPI AK/SK 签名，不是方舟 API Key。
          </Typography.Paragraph>
          <Typography.Paragraph>
            1. `火山素材 Access Key` / `火山素材 Secret Key`：去火山访问密钥页创建
          </Typography.Paragraph>
          <Typography.Paragraph>
            2. 回到 Narrix 安装页点击“校验 AK/SK 并加载素材组”，系统会直接拉取火山已有素材组。
          </Typography.Paragraph>
          <Typography.Paragraph>
            3. 如果当前账号下还没有可用素材组，直接在安装页现场新建一个默认素材组即可。
          </Typography.Paragraph>
          <Typography.Paragraph>
            官方文档：
            <Typography.Link
              href="https://www.volcengine.com/docs/6257/64983"
              target="_blank"
              rel="noreferrer"
            >
              火山访问密钥官方文档
            </Typography.Link>
          </Typography.Paragraph>
        </Card>
      </div>
    </div>
  )
}
