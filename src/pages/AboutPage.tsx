import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>关于</CardTitle>
          <CardDescription>关于本项目的说明</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Finance Penguin 是一个 A 股投资假设验证台：把一句模糊的投资观点，放进
            「候选 → 正反审查 → 风控 → 裁决 → 一周观察计划」的流程里检验。
            不替用户下结论，只回答这个判断值不值得跟踪、以及失效条件是什么。
          </p>
          <p className="text-sm text-muted-foreground">
            纯前端实现，无服务端与数据库。默认演示模式完全离线即可跑通完整流程。
          </p>
          <Button asChild variant="outline" className="w-full">
            <Link to="/">← 返回首页</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
