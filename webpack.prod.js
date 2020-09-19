const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const TerserJSPlugin = require('terser-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const OptimizeCSSAssetsPlugin = require('optimize-css-assets-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const InlineSourcePlugin = require('html-webpack-inline-source-plugin');

const { merge } = require("webpack-merge");
const common = require("./webpack.common");

module.exports = merge(common, {
  mode: "production",
  entry: {
    main: './src/app/index.tsx'
  },
  output: {
    filename: 'js/[name].[contentHash].bundle.js',
    path: path.join(__dirname, '/dist')
  },
  externals: {
    'libsodium-wrappers': 'sodium'
  },
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
      }
    ]
  },
  plugins: [
    new CleanWebpackPlugin(),
    // new BundleAnalyzerPlugin(),
    new MiniCssExtractPlugin({
      filename: 'css/index.[contentHash].css'
    }),
    new HtmlWebpackPlugin({
      template: './src/html/template.ejs',
      filename: 'index.html',
      base: '/',
      inlineSource: 'runtime~.+\\.js',
      sodiumInject: '<script src="js/sodium.js"></script>'
    }),
    new InlineSourcePlugin(HtmlWebpackPlugin),
    new webpack.DefinePlugin({
      HOST: null,
      MITM: JSON.stringify('mitm/mitm.html')
    }),
    new CopyPlugin({
      patterns: [
        { from: './src/images/favicon.ico', to: 'images/favicon.ico' },
        { from: './src/libs/sodium', to: 'js/sodium.js' },
        { from: './src/libs/mitm', to: 'mitm' },
      ],
    }),
  ]
});