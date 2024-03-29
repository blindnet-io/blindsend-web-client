const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const TerserJSPlugin = require('terser-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const OptimizeCSSAssetsPlugin = require('optimize-css-assets-webpack-plugin');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

const { merge } = require("webpack-merge");
const common = require("./webpack.common");

module.exports = merge(common, {
  mode: "production",
  entry: {
    main: './src/app/index.tsx'
  },
  output: {
    filename: 'js/[name].[contenthash].bundle.js',
    path: path.join(__dirname, '/dist')
  },
  performance: { hints: false },
  optimization: {
    minimize: true,
    minimizer: [
      new TerserJSPlugin({
        terserOptions: {
          compress: {
            drop_console: true
          }
        }
      }),
      new OptimizeCSSAssetsPlugin({})
    ],
    runtimeChunk: true,
    splitChunks: {
      chunks: 'all',
    }
  },
  module: {
    rules: [
      {
        test: /\.scss$/,
        use: [
          {
            loader: MiniCssExtractPlugin.loader,
            options: {
              publicPath: '../'
            }
          },
          "css-loader",
          "sass-loader"
        ]
      },
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/i,
        type: 'asset/resource',
      }
    ]
  },
  plugins: [
    // new BundleAnalyzerPlugin(),
    new MiniCssExtractPlugin({
      filename: 'css/index.[contenthash].css'
    }),
    new HtmlWebpackPlugin({
      template: './src/html/template.ejs',
      filename: 'index.html',
      base: '/',
      inlineSource: 'runtime~.+\\.js',
      zipInject: '<script src="js/zip-stream.js"></script>'
    }),
    new CopyPlugin({
      patterns: [
        { from: './src/images/favicon.png', to: 'images/favicon.png' },
        { from: './src/libs/zip-stream.js', to: 'js/zip-stream.js' },
        { from: './src/libs/stream-saver_mitm', to: 'mitm' },
      ],
    }),
    new webpack.DefinePlugin({
      HOST: JSON.stringify('https://api.blindsend.io'),
      MITM: JSON.stringify('mitm/mitm.html'),
      VERSION: JSON.stringify(require("./package.json").version)
    }),
  ]
});