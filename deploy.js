// deploy.js - Hugging Face 专用【隐私增强版】
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http'); 
const { spawn } = require('child_process');

// --- [核心修改 1] 必须启动一个网页，防止 503 错误 ---
function startWebInterface() {
    const port = 7860; // 必须是 7860
    http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
            <h1>✅ EasyTier 运行中</h1>
            <p>连接状态: 已接通隧道</p>
            <p>安全状态: 隐私脱敏已开启</p>
            <hr>
            <p>只要看到这个页面，Hugging Face 状态就会显示为绿色 Running。</p>
        `);
    }).listen(port, '0.0.0.0', () => {
        console.log(`🚀 健康检查网页已在端口 ${port} 启动`);
    });
}

// --- [核心修改 2] 身份显示 ---
function setIdentity(newName) {
    console.log(`--- 🆔 身份设定: ${newName} ---`);
    process.title = newName;
}

// 执行初始化
setIdentity("USA-Galaxy");
startWebInterface();

// 依赖库检查
let AdmZip;
try {
    AdmZip = require('adm-zip');
} catch (e) {
    console.error('❌ 缺少 adm-zip。请确保 package.json 包含 "adm-zip": "^0.5.10"');
    process.exit(1);
}

const TEMP_DIR = path.join(__dirname, 'temp_src');

// 工具函数：下载与解压
async function downloadFile(url, destPath) {
    console.log(`⬇️ 正在下载: ${url}`);
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        https.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
            }
            if (response.statusCode !== 200) return reject(new Error(`下载失败: ${response.statusCode}`));
            response.pipe(file);
            file.on('finish', () => {
                file.close(() => {
                    console.log(`✅ 下载完成`);
                    resolve();
                });
            });
        }).on('error', (err) => {
            fs.unlink(destPath, () => {});
            reject(err);
        });
    });
}

function extractZip(zipPath, targetDir) {
    console.log(`📦 正在解压...`);
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(targetDir, true);
    console.log(`✅ 解压完成`);
}

function findFile(startDir, fileName) {
    const files = fs.readdirSync(startDir, { withFileTypes: true });
    for (const file of files) {
        const fullPath = path.join(startDir, file.name);
        if (file.isDirectory()) {
            const found = findFile(fullPath, fileName);
            if (found) return found;
        } else if (file.name === fileName) return fullPath;
    }
    return null;
}

// --- 主流程 ---
async function main() {
    if (fs.existsSync(TEMP_DIR)) fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    fs.mkdirSync(TEMP_DIR);

    // [安全配置] 使用环境变量，去掉引号
    const etConfig = {
        url: 'https://github.com/EasyTier/EasyTier/releases/download/v2.4.5/easytier-linux-x86_64-v2.4.5.zip',
        zipName: 'easytier.zip',
        binName: 'easytier-core',
        args: [
            '-i', '10.155.155.25',
            '--network-name', process.env.ET_NET_NAME,           
            '--network-secret', process.env.ET_NET_SECRET,           
            '-p', process.env.ET_PEER_URL,   
            '-n', '0.0.0.0/0',               
            '--socks5', process.env.ET_SOCKS_PORT,               
            '--no-tun'                        
        ]
    };

    const zipPath = path.join(TEMP_DIR, etConfig.zipName);
    
    try {
        await downloadFile(etConfig.url, zipPath);
        extractZip(zipPath, TEMP_DIR);
        
        const binaryPath = findFile(TEMP_DIR, etConfig.binName);
        if (!binaryPath) throw new Error(`未找到 easytier-core`);

        fs.chmodSync(binaryPath, '755');
        console.log(`➡️ 正在启动 EasyTier (隐私保护已开启)...`);
        
        // --- [关键修改：隐私过滤逻辑] ---
        // 我们不再使用 'inherit'，而是通过 'pipe' 拦截输出流
        const child = spawn(binaryPath, etConfig.args, { stdio: ['inherit', 'pipe', 'pipe'] });

        let isSensitiveArea = false;

        // 监听标准输出并过滤敏感 TOML 信息
        child.stdout.on('data', (data) => {
            const lines = data.toString().split('\n');
            lines.forEach(line => {
                // 检测到包含密码信息的 TOML 块开始
                if (line.includes('############### TOML ###############')) {
                    isSensitiveArea = true;
                    console.log('############### [隐私配置信息已安全隐藏] ###############');
                    return;
                }
                // 检测到块结束
                if (line.includes('-----------------------------------')) {
                    isSensitiveArea = false;
                    return;
                }

                // 只有不在敏感区域时，才把日志打印到控制台
                if (!isSensitiveArea && line.trim() !== "") {
                    console.log(line);
                }
            });
        });

        // 监听错误输出
        child.stderr.on('data', (data) => {
            process.stderr.write(data);
        });

        child.on('error', (err) => console.error('❌ EasyTier 崩溃:', err));
        child.on('exit', (code) => console.log(`ℹ️ EasyTier 已退出，退出码: ${code}`));
        
    } catch (err) {
        console.error('💥 部署失败:', err.message);
    }
}

main();
