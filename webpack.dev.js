const path = require("path");
const { merge } = require("webpack-merge");
const HtmlWebpackPlugin = require('html-webpack-plugin');
const common = require("./webpack.common");
const webpack = require('webpack');

module.exports = merge(common, {
  mode: "development",
  entry: './src/app/index.tsx',
  output: {
    filename: "bundle.js",
    path: path.join(__dirname, '/dist'),
  },
  devtool: 'cheap-eval-source-map',
  module: {
    rules: [
      {
        test: /\.scss$/,
        use: ["style-loader", "css-loader", "sass-loader"]
      }
    ]
  },
  devServer: {
    contentBase: './src',
    historyApiFallback: true
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/html/template.ejs',
      base: '/',
      sodiumInject: ''
    }),
    new webpack.DefinePlugin({
      HOST: JSON.stringify('http://0.0.0.0:9000'),
      MITM: null
    })
  ]
});