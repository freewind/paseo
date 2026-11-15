const { withAppBuildGradle } = require("expo/config-plugins");

// Expo 模板自带的调试密钥随 expo-template-bare-minimum 分发，不在我们仓库里。
// 模板哪天换掉这个文件，签名就跟着变，已安装的包只能卸载重装、数据全丢。
// 这里把签名配置改指向仓库内的副本，让任何构建路径拿到的都是同一把密钥。
const TEMPLATE_STORE_FILE = "storeFile file('debug.keystore')";
const REPO_STORE_FILE = "storeFile file('../../signing/android-debug.keystore')";

function withDebugSigning(config) {
  return withAppBuildGradle(config, (modConfig) => {
    const { contents } = modConfig.modResults;

    // 用 replace 而不是追加：storeFile 出现在 signingConfigs.debug 里，位置由模板决定。
    // 找不到就报错，否则签名会静默退回模板文件。
    if (!contents.includes(TEMPLATE_STORE_FILE)) {
      throw new Error(
        "with-debug-signing: build.gradle 里没有找到模板的 debug storeFile，模板结构已变，需要更新本 plugin",
      );
    }

    modConfig.modResults.contents = contents.replace(TEMPLATE_STORE_FILE, REPO_STORE_FILE);
    return modConfig;
  });
}

module.exports = withDebugSigning;
