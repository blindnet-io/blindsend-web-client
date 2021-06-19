const path = require("path");
const { merge } = require("webpack-merge");
const HtmlWebpackPlugin = require('html-webpack-plugin');
const common = require("./webpack.common");
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = merge(common, {
  mode: "development",
  entry: {
    main: './src/app/index.tsx'
  },
  output: {
    filename: "[name].bundle.js",
    path: path.join(__dirname, '/dist'),
  },
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.scss$/,
        use: ["style-loader", "css-loader", "sass-loader"]
      },
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/i,
        type: 'asset/resource',
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
      sodiumInject: '<script src="js/sodium.js"></script>'
    }),
    new CopyPlugin({
      patterns: [
        { from: './src/images/favicon.ico', to: 'images/favicon.ico' },
        { from: './src/libs/sodium.js', to: 'js/sodium.js' },
        // { from: './src/libs/mitm', to: 'mitm' },
      ],
    }),
    new webpack.DefinePlugin({
      HOST: JSON.stringify('http://0.0.0.0:9000'),
      MITM: null
    })
  ]
});