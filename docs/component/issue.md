## 🙋 常见问题

### 为什么上传时提示组件已存在？
 请修改你的组件名或版本号

### 如果处理组件静态资源？
使用url-loader，可以参考mojito-compack下的build.js的配置
``` js
rules: [
        {
          test: /\.(png|jpg|gif|jpeg|woff|woff2|eot|ttf|svg)$/,
          use: [
            {
              loader: "url-loader",
              options: {
                limit: 8192,
                publicPath: `/public/libs/${declare.name}${declare.version}/resources/`,
                outputPath: "resources/",
                name: "[name].[ext]",
                esModule: false,
              },
            },
          ],
        },
      ],
```

### 为什么我的组件在本地使用正常，在平台中使用时报错？
  - 检查依赖包是否配置正确
  - 检查组件是否有对空值进行处理，做好异常处理
  - 是否有操作了父容器的DOM

### 如何获取父容器的长宽？
在平台使用时，所有图层都会透传一个styles, styles, styles属性给组件，styles包含的当前图层长宽位置等信息
