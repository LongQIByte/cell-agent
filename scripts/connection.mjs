import { configuration } from './config.mjs';
const config = configuration();
console.log(
  `服务地址：${config.server}\n配对密钥：${config.token}\n网页：${config.web}\nAPK 下载：${config.apk}`,
);
