<#
.SYNOPSIS
  Sacred Focus Docker 一键打包与版本化封装脚本 (Windows PowerShell)
.DESCRIPTION
  遵循大厂标准化镜像交付规范，执行多阶段构建并导出带语义化版本的离线镜像包或推送到镜像仓库。
.EXAMPLE
  .\scripts\docker-pack.ps1 -Version 1.0.0
  .\scripts\docker-pack.ps1 -Version 1.1.0 -Registry "registry.cn-hangzhou.aliyuncs.com/myname"
#>

param (
    [Parameter(Mandatory = $false)]
    [string]$Version = "1.0.0",

    [Parameter(Mandatory = $false)]
    [string]$OutputDir = "./release",

    [Parameter(Mandatory = $false)]
    [string]$Registry = ""
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "📦 Sacred Focus Docker 镜像封装工具 (v$Version)" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. 检查 Docker 运行时
try {
    $dockerVer = docker --version
    Write-Host "✓ 检测到 Docker 环境: $dockerVer" -ForegroundColor Gray
} catch {
    Write-Error "❌ 未检测到 Docker 守护进程，请确认 Docker Desktop 是否已启动并加入 PATH。"
}

$ImageTag = "sacred-focus:v$Version"
$LatestTag = "sacred-focus:latest"

# 2. 执行多阶段构建
Write-Host "`n🚀 开始多阶段构建镜像 [$ImageTag] ..." -ForegroundColor Yellow
$sw = [System.Diagnostics.Stopwatch]::StartNew()

docker build `
    -t $ImageTag `
    -t $LatestTag `
    -f Dockerfile .

if ($LASTEXITCODE -ne 0) {
    Write-Error "❌ Docker 镜像编译构建失败，请检查编译日志！"
}

$sw.Stop()
Write-Host "✓ 镜像构建成功！耗时: $($sw.Elapsed.TotalSeconds.ToString("0.0")) 秒" -ForegroundColor Green

# 3. 若配置了私有镜像仓库，执行推送
if (-not [string]::IsNullOrWhiteSpace($Registry)) {
    $RemoteImage = "$Registry/sacred-focus:v$Version"
    $RemoteLatest = "$Registry/sacred-focus:latest"
    Write-Host "`n📤 推送至远程镜像仓库: $RemoteImage ..." -ForegroundColor Yellow
    docker tag $ImageTag $RemoteImage
    docker tag $LatestTag $RemoteLatest
    docker push $RemoteImage
    docker push $RemoteLatest
    Write-Host "✓ 远程镜像推送完毕！" -ForegroundColor Green
}

# 4. 导出离线镜像包 (.tar)
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

$TarFileName = "sacred-focus-v$Version.tar"
$TarPath = Join-Path $OutputDir $TarFileName

Write-Host "`n💾 正在导出离线镜像包至 $TarPath ..." -ForegroundColor Yellow
docker save -o $TarPath $ImageTag $LatestTag

if (Test-Path $TarPath) {
    $fileSizeMB = (Get-Item $TarPath).Length / 1MB
    Write-Host "✓ 离线镜像包导出完成！" -ForegroundColor Green
    Write-Host "   - 文件路径: $TarPath" -ForegroundColor Cyan
    Write-Host "   - 文件大小: $($fileSizeMB.ToString("0.00")) MB" -ForegroundColor Cyan
}

Write-Host "`n🎉 打包交付流程全部完成！" -ForegroundColor Green
Write-Host "----------------------------------------------------------" -ForegroundColor Gray
Write-Host "👉 虚拟机/服务器更新指南:" -ForegroundColor White
Write-Host "  1. 将 $TarPath 复制到虚拟机中 (例如通过 scp 或共享文件夹)" -ForegroundColor Gray
Write-Host "  2. 在虚拟机执行更新: ./scripts/docker-update.sh $TarFileName" -ForegroundColor Gray
Write-Host "----------------------------------------------------------" -ForegroundColor Gray
