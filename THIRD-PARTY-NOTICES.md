# 第三方组件与模型说明

有光工作台的工作流、界面实现和本地集成由本项目维护，视觉方向参考用户提供的公开案例（见 [参考图分析](参考图分析.md)）；本项目同时使用或可选连接下列第三方软件与模型。版本、来源和许可证可能随上游更新而变化，使用前请核对对应项目的当前说明。

| 项目 | 在本项目中的用途 | 上游信息 |
| --- | --- | --- |
| Vite | 本地开发服务器与前端构建 | [vitejs/vite](https://github.com/vitejs/vite)；本仓库锁定版本为 8.0.13，包元数据标注 MIT |
| fflate | 浏览器端 ZIP 备份 | [101arrowz/fflate](https://github.com/101arrowz/fflate)；本仓库锁定版本为 0.8.3，包元数据标注 MIT |
| MuseTalk | 可选的离线音画口型同步运行环境 | [TMElyralab/MuseTalk](https://github.com/TMElyralab/MuseTalk)；上游代码为 MIT，需另行获取；其第三方依赖另有许可证 |
| YuNet | MuseTalk 集成中的本地人脸检测 | [OpenCV Zoo YuNet](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet)；上游该目录标注 MIT；权重不随本仓库分发 |
| Ollama、ComfyUI | 可选本地语言与图像生成运行环境 | 请从各自官方渠道获取程序、工作流与模型 |
| MuseTalk、Whisper、SD-VAE 等模型权重 | 可选的离线生成与口型同步 | 不包含在本仓库；每份权重可能有不同的使用、再分发或商用条件 |

Node.js 包的直接与传递依赖由 `package-lock.json` 固定。各依赖的版权声明和许可证以对应发行包为准。MuseTalk 上游代码及 YuNet 目录的许可信息可在上方链接核对；模型权重仍须分别检查来源方条款。本仓库不重新发布外部模型权重、运行时应用、用户素材、平台登录凭据或本地数据库。

本项目尚未设置覆盖全部自研代码的项目级许可证。公开浏览代码不代表获得复制、修改或商用授权；若需要为自研部分授予开源许可，请先由维护者明确选择并添加许可证。
